/** Mechanics examples, shared with executable contract tests. Never a response template. */
export const JS_DETAIL_EXAMPLE = `const node = new NodeObject("info", "Comparison", "Two alternatives.", "concept", "comparison");
const sharedStyles = css\`section { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }\`;
node.detailAuthoring.setComponent("main", html\`<section><p>First alternative</p><p>Second alternative</p></section>\`, sharedStyles);`;

export const PYTHON_DETAIL_EXAMPLE = `from relayer_graph import NodeObject, html
node = NodeObject("info", "Comparison", "Two alternatives.", client_key="comparison")
shared_styles = "section { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }"
node.detail_authoring.set_component("main", html("<section><p>First alternative</p><p>Second alternative</p></section>"), shared_styles)`;

export const JS_QUESTION_EXAMPLE = `const question = { kind: "input", label: "Answer", control: "text", prompt: "Which constraint matters most?", sourceLayer: layer, clientKey: "constraint-question" };
node.detailAuthoring.setComponent("question", html\`<label>Constraint <textarea aria-label="Constraint" gc=\${detailCapability.input("constraint", question)}></textarea></label>\`);`;

export const PYTHON_QUESTION_EXAMPLE = `from relayer_graph import ActionObject, action_capability
question = ActionObject("input", "Answer", layer, "constraint-question", control="text", prompt="Which constraint matters most?")
node.detail_authoring.set_component("question", html(['<label>Constraint <textarea aria-label="Constraint" gc=', '></textarea></label>'], action_capability("constraint", question)))`;

const QUESTION_LIFECYCLE = "Question lifecycle: an input control collects an answer for the next user Send, which creates a new interaction. Its presenting response must be finalized before the answer can be committed. Re-reading this interaction's input returns its fixed snapshot; it does not await future answers. Input controls grant no additional write authority.";

export const JS_AUTHORING_REFERENCE = `JavaScript capability reference for this execution:
Read input: const input = await graph.getInteractionInput(). The user text is input.interaction.detail; contexts have targetNode and annotations. Answers are input.submittedInputs ?? []; each has action (control, prompt, and optional options) and value ({ text } or { selected: [{ key, label }] }). There is no top-level input.message.
Draft writes: await graph.submitNode(node); await graph.createEdge(edge); await graph.submitLayer(layer); await graph.addAction(node, action). Constructors: new NodeObject(icon, title, detail, kind, clientKey), new EdgeObject([left, right], clientKey), new LayerObject(nodes, edges, layout, clientKey), new LayerLayoutObject(placements), new NodePlacementObject(node, x, y).
${QUESTION_LIFECYCLE}

Independent mechanics examples, not a recommended response design or required workflow. Import these exports from the graph-client module supplied for this execution. Choose your own content, topology, and publication timing.
Visual component (no publication):
\`\`\`javascript
${JS_DETAIL_EXAMPLE}
await graph.checkpointNodeDetail(node);
\`\`\`
An optional short repair loop: checkpoint a small component before extending it; reuse validated CSS, but create fresh HTML per node. Checkpoint validates and stages detail; it does not accept a response or advance current. Repair the reported component/path before retrying. CSS is the constrained compiler vocabulary below, not browser CSS: border-collapse and cursor are unsupported. Use grid for this comparison. HTML interpolation slots accept typed gc/asset bindings only, not ordinary text or nested HTML strings.
Question control (node is a draft member of layer):
\`\`\`javascript
${JS_QUESTION_EXAMPLE}
\`\`\`
Checkpoint after binding, submit nodes and layer, then register that same question with await graph.addAction(node, question). A control alone is not a response root.
Publication operation, after the complete closure and all actions exist: const current = await graph.getCurrent(); const receipt = await graph.advanceCurrent(layer, current.headRevision, operationKey). Keep the exact transition tuple for retries. This is independent of terminal await graph.submit(interactionNodeId). Choose when to use either; a successful terminal submission ends graph access.`;

export const PYTHON_AUTHORING_REFERENCE = `Python capability reference for this execution:
Read input: interaction = await graph.get_interaction_input(). The user text is interaction.interaction.detail; contexts have target_node and annotations. Answers are interaction.submitted_inputs; each has action (a mapping with control, prompt, and optional options) and value (a mapping with text or selected key/label records). There is no top-level interaction.message.
${QUESTION_LIFECYCLE}

Independent mechanics examples, not a recommended response design or required workflow. Choose your own content, topology, and publication timing. Use the public client API; inspect a specific signature or error when needed.
Visual component (no publication):
\`\`\`python
${PYTHON_DETAIL_EXAMPLE}
await graph.checkpoint_node_detail(node)
\`\`\`
An optional short repair loop: checkpoint a small component before extending it; reuse validated CSS, but create fresh HTML per node. Checkpoint validates and stages detail; it does not accept a response or advance current. Repair the reported component/path before retrying. CSS is the constrained compiler vocabulary below, not browser CSS: border-collapse and cursor are unsupported. Use grid for this comparison. html bindings accept typed action/asset bindings only, not ordinary text or nested HTML strings.
Question control (node is a draft member of layer):
\`\`\`python
${PYTHON_QUESTION_EXAMPLE}
\`\`\`
Checkpoint after binding, submit nodes and layer, then register that same question with await graph.add_action(node, question). A control alone is not a response root.
Publication operation, after the complete closure and all actions exist: current = await graph.get_current(); receipt = await graph.advance_current(layer, expected_revision=current["headRevision"], operation_key=operation_key). Keep the exact transition tuple for retries. This is independent of terminal await graph.submit(interaction_node_id). Choose when to use either; a successful terminal submission ends graph access.`;
