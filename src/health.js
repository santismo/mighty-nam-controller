// Processing faults latch in firmware. A page refresh cannot clear them.
export function processingProblem(state) {
  if (!state || (!state.faults && !(state.loaded && !state.running))) return null;
  return 'The plug stopped audio processing. Lower its headphone volume, restart with POWER only, then tap Refresh. Reconnecting Bluetooth alone will not clear this fault.';
}
export function requireProcessing(state) {
  const message=processingProblem(state);
  if(message)throw Object.assign(new Error(message),{code:'processing-stopped'});
}
export function processingStage(state, ready='Ready') {
  return processingProblem(state)?'Processing stopped — restart plug':ready;
}
