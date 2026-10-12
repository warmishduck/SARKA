// Starts the 8th Wall camera with the pipeline every AR page shares, plus the page's own module.
// Used by the exhibit view (app.js) and the object scanner (scan.js).

/**
 * @param {Object} pageModule - The page's own camera pipeline module, added last.
 * @param {Object} [options]
 * @param {Object[]} [options.imageTargetData] - Image targets to watch for (image-target-cli
 *   output). World tracking stays on alongside them, and the engine then also returns its tracked
 *   points (`reality.worldPoints` in a module's `processCpuResult`), which scan.js measures with.
 */
export const startXr = (pageModule, {imageTargetData} = {}) => {
  const onxrloaded = () => {
    if (imageTargetData) {
      XR8.XrController.configure({imageTargetData, enableWorldPoints: true})
    }
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),      // Draws the camera feed.
      XR8.Threejs.pipelineModule(),                // Creates a ThreeJS AR Scene.
      XR8.CanvasScreenshot.pipelineModule(),       // Lets the photo button capture the camera feed plus content.
      XR8.XrController.pipelineModule(),           // Enables SLAM tracking (and image targets).
      LandingPage.pipelineModule(),                // Detects unsupported browsers and gives hints.
      XRExtras.FullWindowCanvas.pipelineModule(),  // Modifies the canvas to fill the window.
      XRExtras.Loading.pipelineModule(),           // Manages the loading screen on startup.
      XRExtras.RuntimeError.pipelineModule(),      // Shows an error image on runtime error.
      pageModule,
    ])
    XR8.run({canvas: document.getElementById('camerafeed')})
  }
  window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
}
