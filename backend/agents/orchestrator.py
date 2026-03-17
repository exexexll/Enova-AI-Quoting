"""Multi-agent orchestrator with streaming thinking/executing tags via SSE.

Implements the full MFSO quoting workflow:
  1. Intake (销售部 接单询价) — Receive inquiry, gather basic needs
  2. Evaluation (评估) — Feasibility check: can we make this? → if No → Close
  3. Customer Registration (MFSO客户登记) — Capture full client details
  4. Technical Review (研发部 技术评审) — Validate formulation, check ingredients
  5. Cost Calculation (采购部 成本核算与报价) — 5-part pricing engine
  6. Quotation (销售部 制定报价单) — Present quote to client → if rejected → Close
  7. Sample Decision (打样?) — Does client want a sample?
     7a. Yes → Sample Payment (打样付款) → R&D Production (研发部 小样制作)
         → Customer Confirmation (客户 样品确认) → if rejected → loop to 7a
     7b. No → proceed to order
  8. Order Confirmation (销售部 确定订单) — Generate MFSO contract, client signs
  9. Production (订单生产) — Hand off to production
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Optional, cast

from openai import AsyncOpenAI

from backend.config import OPENAI_API_KEY, OPENAI_MODEL
from backend.models.database import get_db
from backend.agents.tools import TOOL_DEFINITIONS, execute_tool

_TOOLS = cast(Any, TOOL_DEFINITIONS)

logger = logging.getLogger(__name__)

_client: Optional[AsyncOpenAI] = None

# ==================== Workflow States ====================
WORKFLOW_STATES = [
    "intake",                # Step 1: Receive inquiry
    "evaluation",            # Step 2: Feasibility check
    "customer_registration", # Step 3: Capture client details
    "technical_review",      # Step 4: Ingredient validation + formulation
    "cost_calculation",      # Step 5: Pricing engine
    "quotation",             # Step 6: Present quote
    "sample_decision",       # Step 7: Sample or straight to order?
    "sample_payment",        # Step 7a: Sample payment
    "sample_production",     # Step 7a: R&D making sample
    "sample_confirmation",   # Step 7a: Client confirms sample
    "order_confirmation",    # Step 8: Contract generation + signing
    "production",            # Step 9: Handed off
    "closed",                # Rejected/abandoned at any point
]

SYSTEM_PROMPT = """You are Enova Science's senior AI Quoting Specialist (Fort Myers, FL). You are an expert in supplement manufacturing — capsules, tablets, powders, gummies, liquids, softgels. You guide clients efficiently through the MFSO quoting workflow while providing knowledgeable, proactive advice.

## YOUR EXPERTISE
- You know standard dosage ranges for common supplements (e.g., Vitamin C: 250–2000mg, CoQ10: 100–300mg, Ashwagandha: 300–600mg)
- You understand capsule sizes (00 fits ~750mg fill, 0 fits ~500mg, 1 fits ~400mg)
- You know that excipients (MCC, silica, magnesium stearate) are needed to fill capsules and aid flow
- You understand manufacturing: blending → encapsulation/tableting → polishing → packaging
- You can recommend formulations proactively when clients are unsure
- You understand premix/blend math: if a client says "60% Vitamin C + 40% Zinc at 500mg total" you calculate 300mg + 200mg

## WORKFLOW

### Step 1 — INTAKE
Greet briefly. Gather in ONE efficient exchange:
- Product form (capsules/tablets/powder/gummy/liquid/softgel)
- Purpose/market (health goal or target audience)
- Quantity (MOQ 10,000 units)
- Key ingredients they want (if known)
**Be proactive**: if the client says "I want a vitamin C product" — immediately suggest a standard formulation (e.g., "A typical Vitamin C capsule is 1000mg Vitamin C + 25mg Zinc + 5mg BioPerine for absorption, 60ct bottle. Want to start with that or customize?")
Record info with `update_session_info`. Then `advance_workflow` → evaluation.

### Step 2 — EVALUATION
Quickly confirm feasibility (almost always yes for standard supplements). Combine with intake if possible — don't make this a separate back-and-forth. `advance_workflow` → customer_registration.

### Step 3 — REGISTRATION
Ask for: name, company, email. Phone and address can wait until contract stage. `advance_workflow` → technical_review.

### Step 4 — TECHNICAL REVIEW (most important step)
This is where you build the formula. For EACH ingredient:
1. Use `search_ingredients` to find it in our database
2. Confirm the exact ingredient name and mg per serving with the client
3. Check if pricing is available — if $0 or missing, use `escalate_ingredient` AND tell the client
4. Proactively suggest complementary ingredients (e.g., with Vitamin C suggest Zinc and BioPerine; with Fish Oil suggest Vitamin E as antioxidant)
5. Validate total fill weight fits the capsule size
6. Recommend excipients for proper capsule fill and flow

**Present a formula summary table** before proceeding:
| Ingredient | mg/serving | Status |
|---|---|---|
| Vitamin C | 1000 | Priced |
| Zinc Citrate | 25 | Priced |
| BioPerine | 5 | Pending |

Also confirm: serving size (# capsules), servings per bottle, bottle count, capsule type.
Once confirmed → `advance_workflow` → cost_calculation.

### Step 5 — COST CALCULATION
Call `calculate_pricing` with all ingredients and specs.
Present results clearly:
- **Per-unit price range**: $X.XX – $Y.YY
- **Breakdown** (ingredients, machine, labor, packaging, shipping)
- **Total order cost**: range × quantity
- Note any estimated items
Then `advance_workflow` → quotation.

### Step 6 — QUOTATION
Summarize the complete quote:
- Product name, form, count
- Full ingredient list
- Price range per unit and total
- MOQ, lead time estimate (~4–8 weeks typical)
- Payment terms (50% deposit, 50% on completion)
Ask: proceed, adjust, or decline?

### Steps 7–9 — SAMPLE → CONTRACT → PRODUCTION
- Sample: offer sample option, explain cost (~$500–2000 for sample run)
- Contract: use `generate_contract` to create MFSO PDF
- Production: confirm handoff

## PRICING RULES
- DB price exists → use it confidently, cite the source
- $0/missing but similar items found → give estimated range with disclaimer, escalate to admin
- No data at all → DO NOT estimate, escalate immediately, tell client "our team is checking"
- Always present as a RANGE, never a single number
- For premix/blends: calculate individual ingredient costs from percentages, then sum

## AGENT BEHAVIOR RULES

### Be Efficient
- Combine multiple simple steps when the information is already available (e.g., intake + evaluation in one turn if client gives enough detail)
- Don't ask questions you can answer yourself (e.g., "Is Vitamin C feasible?" — yes, just say so)
- When client gives a complete request, skip unnecessary back-and-forth and go straight to building the formula

### Be Thorough
- For each ingredient, always search the database before discussing it
- Always mention stock availability when you find an ingredient
- Always flag $0-cost items immediately — don't wait
- Proactively suggest missing components (excipients, complementary ingredients, flavoring for powders)
- Always confirm the complete formula as a table before pricing
- Before pricing, call `validate_formula` to check that ingredients fit the capsule size
- Use `get_session_info` to check what data has already been collected (avoids re-asking the client)

### Be Knowledgeable
- Suggest standard dosages when client is unsure ("A typical dose for Ashwagandha KSM-66 is 300mg twice daily")
- Explain why you recommend something ("Adding BioPerine increases Vitamin C absorption by up to 30%")
- Flag potential issues proactively ("Note: 1500mg total fill per capsule requires size 000 or splitting into 2 capsules per serving")
- For "ea" (each) items like capsule shells, mg_per_serving represents quantity per serving, not weight

### Workflow Flexibility
- Advance the workflow whenever the conversation naturally progresses
- Go backward if client changes requirements (e.g., quotation → cost_calculation for re-quote)
- Skip steps that are already satisfied (e.g., if client gives name/email in first message, skip registration)
- Call `advance_workflow` on EVERY transition to keep the progress indicator accurate
- If a transition is rejected, read the error to see allowed transitions and adjust

## RESPONSE FORMAT
- Use **bold** for key terms, prices, ingredient names
- Use bullet lists for options and breakdowns
- Use tables for formula summaries and pricing
- Keep responses to 2–5 focused paragraphs — comprehensive but not verbose
- End every response with a clear next action or question
"""


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client


async def create_session(
    client_name: str | None = None,
    pre_selected_ingredient: str | None = None,
) -> str:
    """Create a new chat session. Returns session ID."""
    session_id = uuid.uuid4().hex[:16]

    context = {}
    if pre_selected_ingredient:
        context["pre_selected_ingredient"] = pre_selected_ingredient

    with get_db() as conn:
        conn.execute(
            """INSERT INTO sessions (id, client_name, status, workflow_state, context_json)
               VALUES (?,?,?,?,?)""",
            (session_id, client_name, "active", "intake", json.dumps(context)),
        )
    return session_id


def _save_message(session_id: str, role: str, phase: str, content: str, metadata: str | None = None):
    """Save a chat message to the database."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO chat_messages (session_id, role, phase, content, metadata_json)
               VALUES (?,?,?,?,?)""",
            (session_id, role, phase, content, metadata),
        )


def _get_chat_history(session_id: str, limit: int = 50) -> list[dict]:
    """Load recent chat history for a session (excludes the latest user message
    since stream_response appends it explicitly)."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT role, phase, content, metadata_json
               FROM chat_messages
               WHERE session_id=? AND role IN ('user', 'assistant')
               ORDER BY timestamp DESC LIMIT ?""",
            (session_id, limit),
        ).fetchall()

    messages = []
    for row in reversed(rows):
        role = row["role"]
        content = row["content"] or ""
        if role == "assistant" and row["phase"] == "thinking":
            continue  # Don't feed thinking back as history
        messages.append({"role": role, "content": content})

    return messages


def _generate_session_topic(session_id: str, first_message: str):
    """Generate a short topic name for the session from the first user message."""
    msg = first_message.strip()

    # Skip file upload messages — use a generic name instead
    if msg.startswith("[File:") or "I've uploaded" in msg or "uploaded a file" in msg.lower():
        topic = "File Upload"
        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET client_name=?, updated_at=datetime('now') WHERE id=? AND client_name IS NULL",
                (topic, session_id),
            )
        return

    # Extract product type from standard messages
    topic = None
    for pattern in [
        "product with ", "product using ", "interested in ", "want to make ",
        "need ", "looking for ", "create a ", "create ", "formulate ",
    ]:
        idx = msg.lower().find(pattern)
        if idx >= 0:
            after = msg[idx + len(pattern):].strip().rstrip(".,!?")
            words = after.split()[:5]
            topic = " ".join(words).strip(".,!?")
            break

    if not topic:
        words = msg.split()[:5]
        topic = " ".join(words).strip(".,!?")

    if topic:
        # Clean up markdown and special chars
        topic = topic.replace("**", "").replace("*", "").replace("#", "")
        for sep in ['.', '?', '!', ' can ', ' and ']:
            if sep in topic.lower():
                topic = topic[:topic.lower().index(sep)].strip()
        topic = " ".join(topic.split()[:5])
        topic = topic.title() if len(topic) < 40 else topic[:40].title()

        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET client_name=?, updated_at=datetime('now') WHERE id=? AND client_name IS NULL",
                (topic, session_id),
            )
        logger.info("Session %s topic: %s", session_id, topic)


def _get_workflow_state(session_id: str) -> str:
    """Get current workflow state for a session."""
    with get_db() as conn:
        row = conn.execute("SELECT workflow_state FROM sessions WHERE id=?", (session_id,)).fetchone()
    return row["workflow_state"] if row else "intake"


async def stream_response(
    session_id: str,
    user_message: str,
) -> AsyncGenerator[dict, None]:
    """Stream a response with thinking/executing tags.

    Yields dicts with event types: thinking, executing, tool_call, tool_result,
    price_update, popup, workflow_state, done.
    """
    # Load history BEFORE saving the new message
    history = _get_chat_history(session_id)

    # Save user message
    _save_message(session_id, "user", "executing", user_message)

    # Auto-generate a session topic name from the first user message
    if len(history) == 0:
        _generate_session_topic(session_id, user_message)

    # Get current workflow state to inject into context
    current_state = _get_workflow_state(session_id)

    # Build messages with workflow context
    state_context = f"\n[SYSTEM: Current workflow state is '{current_state}'. Follow the workflow instructions for this step.]"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + state_context},
        *history,
        {"role": "user", "content": user_message},
    ]

    client = _get_client()
    thinking_buffer = ""
    executing_buffer = ""

    MAX_TOOL_ROUNDS = 8
    current_messages = list(messages)
    loop_broke_on_error = False

    for tool_round in range(MAX_TOOL_ROUNDS + 1):
        tool_calls_buffer: dict[int, dict] = {}
        round_content = ""
        round_finish = None

        try:
            stream_iter = await client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=current_messages,
                tools=_TOOLS,
                stream=True,
            )
        except Exception as e:
            if tool_round == 0:
                logger.exception("OpenAI API error: %s", e)
                error_msg = f"I apologize, but I encountered an error connecting to the AI service. Please try again. (Error: {type(e).__name__})"
                _save_message(session_id, "assistant", "executing", error_msg)
                yield {"event": "executing", "data": error_msg}
                yield {"event": "done", "data": ""}
                return
            logger.exception("Tool round %d stream error: %s", tool_round, e)
            loop_broke_on_error = True
            break

        async for chunk in stream_iter:
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            finish_reason = chunk.choices[0].finish_reason

            reasoning_text = getattr(delta, "reasoning", None)
            if reasoning_text:
                thinking_buffer += reasoning_text
                yield {"event": "thinking", "data": reasoning_text}

            if delta.content:
                round_content += delta.content
                executing_buffer += delta.content
                yield {"event": "executing", "data": delta.content}

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_buffer:
                        tool_calls_buffer[idx] = {"id": tc.id or "", "name": "", "arguments": ""}
                    if tc.id:
                        tool_calls_buffer[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_buffer[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_buffer[idx]["arguments"] += tc.function.arguments

            if finish_reason:
                round_finish = finish_reason

        if round_finish != "tool_calls" or not tool_calls_buffer:
            break

        # Execute tool calls
        tool_results_cache: dict[int, str] = {}
        for idx in sorted(tool_calls_buffer.keys()):
            tc_data = tool_calls_buffer[idx]
            tool_name = tc_data["name"]
            try:
                args = json.loads(tc_data["arguments"])
            except json.JSONDecodeError:
                args = {}

            yield {"event": "tool_call", "data": json.dumps({"tool": tool_name, "args": args})}

            result = await execute_tool(tool_name, args, session_id)
            tool_results_cache[idx] = result
            _save_message(session_id, "tool", "tool_result", result, json.dumps({"tool": tool_name}))

            yield {"event": "tool_result", "data": result}

            try:
                result_data = json.loads(result)
                if "action" in result_data:
                    if result_data["action"] == "show_ingredient_popup":
                        yield {"event": "popup", "data": result}
                if "total" in result_data:
                    yield {"event": "price_update", "data": result}
                if "workflow_state" in result_data:
                    yield {"event": "workflow_state", "data": json.dumps({"state": result_data["workflow_state"]})}
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

        # Build updated message list for next round
        current_messages.append({
            "role": "assistant",
            "content": round_content or None,
            "tool_calls": [
                {
                    "id": tool_calls_buffer[idx]["id"],
                    "type": "function",
                    "function": {
                        "name": tool_calls_buffer[idx]["name"],
                        "arguments": tool_calls_buffer[idx]["arguments"],
                    },
                }
                for idx in sorted(tool_calls_buffer.keys())
            ],
        })
        for idx in sorted(tool_calls_buffer.keys()):
            current_messages.append({
                "role": "tool",
                "tool_call_id": tool_calls_buffer[idx]["id"],
                "content": tool_results_cache[idx],
            })

        # Persist thinking after each tool round to avoid data loss on crash
        if thinking_buffer:
            _save_message(session_id, "assistant", "thinking", thinking_buffer)
            thinking_buffer = ""

    else:
        # Exhausted all tool rounds without a final content response
        max_rounds_msg = "I've completed multiple processing steps. Let me summarize what I've done so far."
        executing_buffer += max_rounds_msg
        yield {"event": "executing", "data": max_rounds_msg}

    # Handle error break: add a note to the user
    if loop_broke_on_error and executing_buffer:
        error_note = "\n\n*(Note: An internal error occurred during processing. The information above may be incomplete.)*"
        executing_buffer += error_note
        yield {"event": "executing", "data": error_note}

    # Persist final buffers
    if thinking_buffer:
        _save_message(session_id, "assistant", "thinking", thinking_buffer)
    if executing_buffer:
        _save_message(session_id, "assistant", "executing", executing_buffer)

    yield {"event": "done", "data": ""}
