// Browser expressions for native-thread evidence. Imported/legacy threads keep
// their separate turn-picker assertions.
export function interactionPositionCondition(position, total) {
  return `(() => {
    const cards = [...document.querySelectorAll('#turnPopover .interaction-graph-node')];
    return document.querySelector('#turnPickerButton')?.classList.contains('interaction-graph-trigger')
      && cards.length === ${total}
      && cards.findIndex(card => card.getAttribute('aria-current') === 'true') === ${position - 1};
  })()`;
}

export function selectRelativeInteraction(offset) {
  return `(() => {
    const cards = [...document.querySelectorAll('#turnPopover .interaction-graph-node')];
    const index = cards.findIndex(card => card.getAttribute('aria-current') === 'true');
    const target = cards[index + ${offset}];
    if (index < 0 || !target || target.disabled) return false;
    const trigger = document.querySelector('#turnPickerButton');
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    target.click();
    return true;
  })()`;
}
