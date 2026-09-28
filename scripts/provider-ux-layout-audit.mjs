export function auditProviderSidebarLayout(snapshot) {
  const expectedGraphNodeIds = ["910", "911", "912"];
  const hasPositiveRect = (rect) => Boolean(rect)
    && [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0
    && rect.right > rect.left && rect.bottom > rect.top;
  const contained = (fact, bounds) => Boolean(fact?.present && fact.visible)
    && hasPositiveRect(fact.rect) && hasPositiveRect(bounds)
    && fact.rect.left >= bounds.left - 0.5
    && fact.rect.top >= bounds.top - 0.5
    && fact.rect.right <= bounds.right + 0.5
    && fact.rect.bottom <= bounds.bottom + 0.5;
  const scene = snapshot.scene;
  const threadScene = scene.startsWith("sidebar-thread-");
  const expectedMenu = scene.endsWith("-permission-menu") ? "permission"
    : scene.endsWith("-model-menu") ? "model"
      : scene.endsWith("-scope-menu") || scene.endsWith("-menu") ? "scope" : null;
  const sidebarRect = snapshot.sidebar?.rect;
  const viewport = { left: 0, top: 0, right: snapshot.viewportWidth, bottom: snapshot.viewportHeight,
    width: snapshot.viewportWidth, height: snapshot.viewportHeight };
  const graphNodeCounts = new Map();
  for (const node of snapshot.graphNodes) graphNodeCounts.set(String(node.id), (graphNodeCounts.get(String(node.id)) ?? 0) + 1);
  const expectedNodes = expectedGraphNodeIds.map((id) => snapshot.graphNodes.find((node) => String(node.id) === id));
  const graphNodesPresentOnce = !threadScene || (snapshot.graphNodes.length === expectedGraphNodeIds.length
    && expectedNodes.every((node, index) => node?.present
      && graphNodeCounts.get(expectedGraphNodeIds[index]) === 1));
  const graphNodesHavePositiveArea = !threadScene || expectedNodes.every((node) => node?.visible && hasPositiveRect(node.rect));
  const allGraphNodesWithinCanvas = !threadScene || Boolean(snapshot.graphStage?.present && snapshot.graphStage.visible
    && hasPositiveRect(snapshot.graphStage.rect)
    && snapshot.graphNodes.length === expectedGraphNodeIds.length
    && snapshot.graphNodes.every((node) => contained(node, snapshot.graphStage.rect)));
  const expectedControls = snapshot.expectedControls;
  const expectedControlsVisible = expectedControls.length > 0
    && expectedControls.every((control) => control.present && control.visible && hasPositiveRect(control.rect));
  const expectedControlsWithinComposer = expectedControlsVisible
    && expectedControls.every((control) => contained(control, snapshot.composer.rect));
  const menusWithinViewport = Object.entries(snapshot.menus).every(([name, menu]) => {
    if (name === expectedMenu) return menu.present && menu.visible && contained(menu, viewport);
    return !menu.visible;
  }) && (expectedMenu === null || snapshot.menus[expectedMenu]?.present === true);
  return {
    graphNodesPresentOnce,
    graphNodesHavePositiveArea,
    allGraphNodesWithinCanvas,
    graphToolbarWithinCanvas: !threadScene || contained(snapshot.graphToolbar, snapshot.graphStage?.rect),
    toggleWithinSidebar: contained(snapshot.sidebarToggle, sidebarRect),
    footerControlsWithinSidebar: snapshot.footerControls.length === 2
      && snapshot.footerControls.every((control) => contained(control, sidebarRect)),
    activeComposerWithinViewport: contained(snapshot.composer, viewport),
    composerControlsWithinComposer: expectedControlsWithinComposer,
    openMenus: Object.values(snapshot.menus).filter((menu) => menu.visible).map((menu) => menu.rect),
    menusWithinViewport,
  };
}

export const providerSidebarAuditFunctionSource = `(${auditProviderSidebarLayout.toString()})`;

export function collectProviderSidebarSnapshot(document, window, scene) {
  const elementRendered = ({ present, hasClientRect, ancestors }) => present === true && hasClientRect === true
    && Array.isArray(ancestors) && ancestors.length > 0
    && ancestors.every(({ display, visibility, opacity }) => {
      const parsedOpacity = Number(opacity);
      return display !== "none" && visibility !== "hidden" && visibility !== "collapse"
        && Number.isFinite(parsedOpacity) && parsedOpacity > 0;
    });
  const box = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const fact = (element) => {
    if (!element) return { present: false, visible: false, rect: null };
    const ancestors = [];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      ancestors.push({ display: style.display, visibility: style.visibility, opacity: style.opacity });
    }
    return {
      present: true,
      visible: elementRendered({ present: true, hasClientRect: element.getClientRects().length > 0, ancestors }),
      rect: box(element),
    };
  };
  const sidebar = document.querySelector(".sidebar");
  const sidebarToggle = document.querySelector("#collapseSidebar");
  const accountButton = document.querySelector("#desktopAccountButton");
  const settingsButton = document.querySelector("#settingsButton");
  const graphStage = document.querySelector("#graphStage");
  const graphToolbar = document.querySelector(".graph-controls");
  const newThreadView = document.querySelector("#newThreadView");
  const isNewThread = Boolean(newThreadView && !newThreadView.classList.contains("hidden"));
  const activeComposer = isNewThread ? newThreadView.querySelector(".new-composer") : document.querySelector("#threadComposer");
  const controls = isNewThread
    ? ["#newThreadPrompt", "#scopeButton", "#permissionButton", '#newModelControl [data-model-picker-trigger]', "#createThread"]
    : ["#threadPrompt", '#threadComposer [data-model-picker-trigger]', "#sendInteraction"];
  return {
    scene,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    sidebar: fact(sidebar),
    sidebarToggle: fact(sidebarToggle),
    footerControls: [fact(accountButton), fact(settingsButton)],
    graphStage: fact(graphStage),
    graphToolbar: fact(graphToolbar),
    graphNodes: [...document.querySelectorAll("#graphStage #nodeLayer .graph-node")]
      .map((node) => ({ ...fact(node), id: node.getAttribute("data-node") })),
    composer: fact(activeComposer),
    expectedControls: controls.map((selector) => fact(document.querySelector(selector))),
    menus: {
      scope: fact(document.querySelector("#scopeMenu")),
      permission: fact(document.querySelector("#permissionMenu")),
      model: fact(document.querySelector('[data-model-picker="new"] [data-model-picker-popover]')),
    },
  };
}

export const providerSidebarSnapshotFunctionSource = `(${collectProviderSidebarSnapshot.toString()})`;
