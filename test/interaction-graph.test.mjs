import { describe,it,expect } from "vitest";
import { interactionGraph } from "../desktop/renderer/src/product-workspace/interaction-graph.js";

describe("canonical interaction graph",()=>{
 it("uses explicit layer-owner sources, groups attachments and leaves chronology disconnected",()=>{
  const turns=[{id:1,threadId:10,text:"Original author",sequence:1},{id:2,threadId:10,text:"Presenter",sequence:2},{id:3,threadId:10,text:"Follow-up",sequence:3,contexts:[{},{},{}],interactionGraph:{enabled:true,sources:[{interactionId:8,threadId:20,text:"Actual layer owner",layers:[{layerId:50,nodeIds:[11,12]},{layerId:51,nodeIds:[13]}],invocationActionId:null}]}}];
  const graph=interactionGraph(turns,3);
  expect(graph.edges).toEqual([{source:"8",target:"3",layers:[{layerId:50,nodeIds:[11,12]},{layerId:51,nodeIds:[13]}],invocationActionId:null}]);
  expect(graph.nodes.map(n=>n.id)).toEqual(["1","2","3","8"]);
  expect(graph.contextCount).toBe(3);
  expect(graph.nodes.find(n=>n.id==="8").threadId).toBe(20);
 });
 it("adds only canonical invocation edges and fails closed without the gate",()=>{
  const turns=[{id:1,threadId:10},{id:2,threadId:10,interactionGraph:{enabled:true,sources:[{interactionId:1,threadId:10,layers:[],invocationActionId:90}]}}];
  expect(interactionGraph(turns,2).edges[0]).toMatchObject({source:"1",target:"2",invocationActionId:90});
  expect(interactionGraph(turns,1)).toBeNull();
 });
});
