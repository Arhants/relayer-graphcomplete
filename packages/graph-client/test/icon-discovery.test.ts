import { describe, expect, it } from "vitest";
import { GraphIcons } from "../src/icon-discovery.js";

describe("typed icon discovery client", () => {
  it("sends scoped bounded catalog discovery and decodes individual/contact-sheet bytes", async () => {
    const sent: {path:string; body: unknown}[] = [];
    const preview = {name:"fish.svg",mediaType:"image/svg+xml",contentBase64:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")};
    const icons = new GraphIcons(async (path,init) => {
      sent.push({path,body:JSON.parse(String(init.body))});
      return path.endsWith("discover") ? {items:[{id:"fish",kind:"symbol",icon:"fish"}],candidateSource:"catalog-text-v1"} : {previews:[preview],contactSheet:preview};
    });
    const result = await icons.discover({query:"marine",kind:"symbols",limit:2,scope:{kind:"thread",threadId:7}});
    expect(result.items[0]?.icon).toBe("fish");
    const inspection = await icons.inspect(["fish"],{contactSheet:true});
    expect(Buffer.from(await inspection.previews[0]!.read()).toString()).toContain("<svg");
    expect(inspection.contactSheet?.name).toBe("fish.svg");
    expect(sent).toEqual([
      {path:"/api/graph/icons/discover",body:{query:"marine",kind:"symbols",limit:2,scope:{kind:"thread",threadId:7}}},
      {path:"/api/graph/icons/inspect",body:{icons:["fish"],contactSheet:true}},
    ]);
  });
});
