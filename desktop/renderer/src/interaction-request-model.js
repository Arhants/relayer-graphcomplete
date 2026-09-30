export function newThreadRequestBody({
  title,
  initialMessage,
  permissionProfileId,
  projectId,
  pickerPayload,
  workingDirectory,
  creationRequestId,
  expectedCheckout,
}) {
  return {
    title,
    initialMessage,
    permissionProfileId,
    harnessId: pickerPayload.harnessId,
    modelSelection: pickerPayload.modelSelection,
    ...(projectId ? { projectId } : {}),
    ...(projectId && workingDirectory ? { workingDirectory } : {}),
    ...(creationRequestId ? { creationRequestId } : {}),
    ...(expectedCheckout ? { expectedCheckout } : {}),
  };
}

// An unchanged first Send retries its existing receipt; an edited request is a
// new user intent while any already-created worktree remains in the draft.
export function stableNewThreadRequest(scope, input, createId = () => crypto.randomUUID()) {
  const body = newThreadRequestBody(input);
  delete body.creationRequestId;
  const { expectedCheckout: _expectedCheckout, ...intent } = body;
  const payload = JSON.stringify(intent);
  if (!scope.creationRequestId || (scope.creationRequestPayload && scope.creationRequestPayload !== payload)) {
    scope.creationRequestId = createId();
  }
  scope.creationRequestPayload = payload;
  return { ...body, creationRequestId: scope.creationRequestId };
}

export function followupRequestBody(
  text,
  modelSelection,
  inputId,
  contexts = [],
  contextConfirmationIds = [],
  inputDraftRevision = null,
) {
  if (!inputId) throw new Error("A stable inputId is required for a follow-up send.");
  return {
    text,
    inputId,
    contexts,
    contextConfirmationIds,
    modelSelection,
    ...(inputDraftRevision == null ? {} : { inputDraftRevision }),
  };
}

const pendingFollowupSends = new Map();

export function stableFollowupInputId(
  threadId,
  text,
  modelSelection,
  contexts = [],
  contextConfirmationIds = [],
  inputDraftRevision = null,
) {
  const content = JSON.stringify({
    threadId: String(threadId),
    text,
    modelSelection,
    contexts,
    contextConfirmationIds,
    inputDraftRevision,
  });
  const pending = pendingFollowupSends.get(content);
  if (pending) return pending;
  const inputId = crypto.randomUUID();
  pendingFollowupSends.set(content, inputId);
  return inputId;
}

export function markFollowupSendSucceeded(inputId) {
  for (const [content, pendingInputId] of pendingFollowupSends) {
    if (pendingInputId === inputId) {
      pendingFollowupSends.delete(content);
      return;
    }
  }
}
