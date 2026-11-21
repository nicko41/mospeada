// Rendering telemetry only; never changes simulation, camera or quality.
export const renderFrameMetrics={frame:0,drawCalls:0,triangles:0,width:0,height:0,pixelRatio:1}
export function publishRenderMetrics(renderer,stats){
  renderFrameMetrics.frame++
  Object.assign(renderFrameMetrics,{drawCalls:stats.renderCalls,triangles:stats.renderTriangles||0,width:renderer.domElement?.width||0,height:renderer.domElement?.height||0,pixelRatio:renderer.getPixelRatio?.()??1})
}
