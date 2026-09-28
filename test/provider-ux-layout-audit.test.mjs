import { describe, expect, it } from "vitest";

import {
  auditProviderSidebarLayout,
  providerSidebarAuditFunctionSource,
  collectProviderSidebarSnapshot,
  providerSidebarSnapshotFunctionSource,
} from "../scripts/provider-ux-layout-audit.mjs";

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const fact = (left, top, width, height, { present = true, visible = true } = {}) => ({
  present,
  visible,
  rect: present ? rect(left, top, width, height) : null,
});

function threadSnapshot(overrides = {}) {
  const stage = rect(210, 0, 410, 800);
  const nodes = [910, 911, 912].map((id, index) => ({ id: String(id), ...fact(230 + index * 70, 100 + index * 60, 42, 36) }));
  const composer = fact(230, 650, 370, 100);
  return {
    scene: "sidebar-thread-expanded",
    viewportWidth: 620,
    viewportHeight: 800,
    sidebar: fact(0, 0, 210, 800),
    sidebarToggle: fact(170, 0, 40, 40),
    footerControls: [fact(12, 710, 80, 32), fact(12, 750, 80, 32)],
    graphStage: { present: true, visible: true, rect: stage },
    graphToolbar: fact(220, 10, 150, 36),
    graphNodes: nodes,
    composer,
    expectedControls: [fact(240, 670, 280, 32), fact(530, 670, 32, 32), fact(565, 670, 32, 32)],
    menus: {
      scope: fact(0, 0, 0, 0, { present: false, visible: false }),
      permission: fact(0, 0, 0, 0, { present: false, visible: false }),
      model: fact(0, 0, 0, 0, { present: false, visible: false }),
    },
    ...overrides,
  };
}

function renderedDomFixture() {
  const makeElement = (id, bounds, parentElement = null, style = {}, hidden = false) => ({
    id,
    style,
    parentElement,
    classList: { contains: (name) => name === "hidden" && hidden },
    getClientRects: () => bounds && bounds.width > 0 && bounds.height > 0 ? [{}] : [],
    getBoundingClientRect: () => bounds,
    getAttribute: (name) => name === "data-node" ? id : null,
    querySelector: () => null,
  });
  const body = makeElement("body", rect(0, 0, 620, 800));
  const sidebar = makeElement("sidebar", rect(0, 0, 210, 800), body);
  const toggleParent = makeElement("toggleParent", rect(0, 0, 210, 50), sidebar);
  const footerParent = makeElement("footerParent", rect(0, 700, 210, 100), sidebar);
  const main = makeElement("main", rect(210, 0, 410, 800), body);
  const stage = makeElement("stage", rect(210, 0, 410, 800), main);
  const toolbar = makeElement("toolbar", rect(220, 10, 150, 36), stage);
  const layer = makeElement("layer", rect(210, 0, 410, 800), stage);
  const nodes = ["910", "911", "912"].map((id, index) => makeElement(id, rect(230 + index * 70, 100 + index * 60, 42, 36), layer));
  const composer = makeElement("composer", rect(230, 650, 370, 100), main);
  const controlParent = makeElement("controlParent", rect(230, 670, 370, 32), composer);
  const newThreadView = makeElement("newThreadView", rect(0, 0, 0, 0), main, {}, true);
  const entries = new Map([
    [".sidebar", sidebar], ["#collapseSidebar", makeElement("toggle", rect(170, 0, 40, 40), toggleParent)],
    ["#desktopAccountButton", makeElement("account", rect(12, 710, 80, 32), footerParent)],
    ["#settingsButton", makeElement("settings", rect(12, 750, 80, 32), footerParent)],
    ["#graphStage", stage], [".graph-controls", toolbar], ["#newThreadView", newThreadView], ["#threadComposer", composer],
    ["#threadPrompt", makeElement("prompt", rect(240, 670, 250, 32), controlParent)],
    ['#threadComposer [data-model-picker-trigger]', makeElement("picker", rect(500, 670, 32, 32), controlParent)],
    ["#sendInteraction", makeElement("send", rect(540, 670, 32, 32), controlParent)],
    ["#scopeMenu", makeElement("scopeMenu", rect(0, 0, 0, 0), body, { display: "none" })],
    ["#permissionMenu", makeElement("permissionMenu", rect(0, 0, 0, 0), body, { display: "none" })],
    ['[data-model-picker="new"] [data-model-picker-popover]', makeElement("modelMenu", rect(0, 0, 0, 0), body, { display: "none" })],
  ]);
  const document = {
    querySelector: (selector) => entries.get(selector) ?? null,
    querySelectorAll: (selector) => selector === "#graphStage #nodeLayer .graph-node" ? nodes : [],
  };
  const window = {
    innerWidth: 620,
    innerHeight: 800,
    getComputedStyle: (element) => ({
      display: element.style.display ?? "block",
      visibility: element.style.visibility ?? "visible",
      opacity: element.style.opacity ?? "1",
    }),
  };
  return { document, window, sidebar, footerParent, toggleParent, controlParent, entries };
}

describe("provider UX capture layout audit", () => {
  it("accepts expected saved graph nodes and visible controls within their production regions", () => {
    const result = auditProviderSidebarLayout(threadSnapshot());
    expect(result.graphNodesPresentOnce).toBe(true);
    expect(result.graphNodesHavePositiveArea).toBe(true);
    expect(result.allGraphNodesWithinCanvas).toBe(true);
    expect(result.graphToolbarWithinCanvas).toBe(true);
    expect(result.toggleWithinSidebar).toBe(true);
    expect(result.footerControlsWithinSidebar).toBe(true);
    expect(result.activeComposerWithinViewport).toBe(true);
    expect(result.composerControlsWithinComposer).toBe(true);
    expect(result.menusWithinViewport).toBe(true);
  });

  it.each([
    ["missing expected graph node", (snapshot) => { snapshot.graphNodes = snapshot.graphNodes.filter(({ id }) => id !== "911"); }],
    ["duplicate expected graph node", (snapshot) => { snapshot.graphNodes.push({ ...snapshot.graphNodes[0] }); }],
    ["zero-area expected node", (snapshot) => { snapshot.graphNodes[1].rect = rect(300, 200, 0, 20); }],
  ])("rejects %s", (_label, mutate) => {
    const snapshot = threadSnapshot();
    mutate(snapshot);
    const result = auditProviderSidebarLayout(snapshot);
    if (_label.includes("zero-area")) {
      expect(result.graphNodesPresentOnce).toBe(true);
      expect(result.graphNodesHavePositiveArea).toBe(false);
    } else {
      expect(result.graphNodesPresentOnce).toBe(false);
    }
  });

  it("rejects vertical canvas clipping while preserving the separate panning exception signal", () => {
    const snapshot = threadSnapshot();
    snapshot.graphNodes[2].rect = rect(500, 790, 42, 36);
    const result = auditProviderSidebarLayout(snapshot);
    expect(result.graphNodesPresentOnce).toBe(true);
    expect(result.graphNodesHavePositiveArea).toBe(true);
    expect(result.allGraphNodesWithinCanvas).toBe(false);
  });

  it("rejects hidden ancestors and missing expected composer controls", () => {
    const snapshot = threadSnapshot();
    snapshot.expectedControls[0].visible = false;
    expect(auditProviderSidebarLayout(snapshot).composerControlsWithinComposer).toBe(false);
    snapshot.expectedControls = [];
    expect(auditProviderSidebarLayout(snapshot).composerControlsWithinComposer).toBe(false);
  });

  it.each([
    ["above", -120],
    ["below", 790],
  ])("rejects an otherwise valid composer positioned %s the viewport", (_label, top) => {
    const snapshot = threadSnapshot();
    const delta = top - snapshot.composer.rect.top;
    snapshot.composer.rect = rect(snapshot.composer.rect.left, top, snapshot.composer.rect.width, snapshot.composer.rect.height);
    snapshot.expectedControls = snapshot.expectedControls.map((control) => ({
      ...control,
      rect: rect(control.rect.left, control.rect.top + delta, control.rect.width, control.rect.height),
    }));
    const result = auditProviderSidebarLayout(snapshot);
    expect(result.composerControlsWithinComposer).toBe(true);
    expect(result.activeComposerWithinViewport).toBe(false);
  });

  it.each([
    ["above", (snapshot) => { snapshot.expectedControls[0].rect.top = snapshot.composer.rect.top - 1; snapshot.expectedControls[0].rect.bottom -= 1; }],
    ["below", (snapshot) => { snapshot.expectedControls[0].rect.top = snapshot.composer.rect.bottom; snapshot.expectedControls[0].rect.bottom += 32; }],
  ])("rejects a composer control protruding %s its composer", (_label, mutate) => {
    const snapshot = threadSnapshot();
    mutate(snapshot);
    expect(auditProviderSidebarLayout(snapshot).composerControlsWithinComposer).toBe(false);
  });

  it("collects computed visibility through actual element ancestors for the production audit", () => {
    const fixture = renderedDomFixture();
    const collect = new Function(`return ${providerSidebarSnapshotFunctionSource}`)();
    const snapshot = collect(fixture.document, fixture.window, "sidebar-thread-expanded");
    expect(auditProviderSidebarLayout(snapshot).toggleWithinSidebar).toBe(true);
    fixture.toggleParent.style.visibility = "hidden";
    expect(auditProviderSidebarLayout(collect(fixture.document, fixture.window, snapshot.scene)).toggleWithinSidebar).toBe(false);
    fixture.toggleParent.style.visibility = "visible";
    fixture.footerParent.style.display = "none";
    expect(auditProviderSidebarLayout(collect(fixture.document, fixture.window, snapshot.scene)).footerControlsWithinSidebar).toBe(false);
    fixture.footerParent.style.display = "block";
    fixture.entries.get(".graph-controls").style.visibility = "hidden";
    expect(auditProviderSidebarLayout(collect(fixture.document, fixture.window, snapshot.scene)).graphToolbarWithinCanvas).toBe(false);
    fixture.entries.get(".graph-controls").style.visibility = "visible";
    fixture.controlParent.style.opacity = "0";
    expect(auditProviderSidebarLayout(collect(fixture.document, fixture.window, snapshot.scene)).composerControlsWithinComposer).toBe(false);
  });

  it("keeps the exact browser snapshot collector and audit serializable for mutation proof", () => {
    expect(() => new Function(`return ${providerSidebarSnapshotFunctionSource}`)()).not.toThrow();
    expect(() => new Function(`return ${providerSidebarAuditFunctionSource}`)()).not.toThrow();
  });

  it("requires the scene-specific expected menu to be rendered and within the viewport", () => {
    const snapshot = threadSnapshot({
      scene: "sidebar-new-thread-483-expanded-scope-menu",
      expectedControls: [fact(220, 620, 250, 36)],
      composer: fact(210, 600, 270, 150),
      menus: {
        scope: fact(230, 650, 220, 120),
        permission: fact(0, 0, 0, 0, { present: false, visible: false }),
        model: fact(0, 0, 0, 0, { present: false, visible: false }),
      },
    });
    expect(auditProviderSidebarLayout(snapshot).menusWithinViewport).toBe(true);
    snapshot.menus.scope.visible = false;
    expect(auditProviderSidebarLayout(snapshot).menusWithinViewport).toBe(false);
    snapshot.menus.scope.visible = true;
    snapshot.menus.scope.rect = rect(300, 790, 220, 120);
    expect(auditProviderSidebarLayout(snapshot).menusWithinViewport).toBe(false);
  });

  it.each([
    ["permission", "sidebar-new-thread-483-expanded-permission-menu"],
    ["model", "sidebar-new-thread-483-expanded-model-menu"],
  ])("requires the %s menu for its own capture scene", (expected, scene) => {
    const snapshot = threadSnapshot({
      scene,
      menus: {
        scope: fact(0, 0, 0, 0, { present: false, visible: false }),
        permission: expected === "permission" ? fact(220, 610, 180, 130) : fact(0, 0, 0, 0, { present: false, visible: false }),
        model: expected === "model" ? fact(220, 610, 180, 130) : fact(0, 0, 0, 0, { present: false, visible: false }),
      },
    });
    const productionPredicate = new Function(`return ${providerSidebarAuditFunctionSource}`)();
    expect(productionPredicate(snapshot).menusWithinViewport).toBe(true);
    snapshot.menus[expected].visible = false;
    expect(productionPredicate(snapshot).menusWithinViewport).toBe(false);
  });
});
