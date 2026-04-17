<script lang="ts">
  const SDK_SPEC_URL = '/sdk/openapi-v1.json';
  const SDK_BUNDLE_URL = '/sdk/nebulaforge-sdk.js';
  const SDK_SPEC_VERSION = '1.1.0';

  async function downloadSpec() {
    const res = await fetch(SDK_SPEC_URL);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nebulaforge-sdk-v${SDK_SPEC_VERSION}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadBundle() {
    const res = await fetch(SDK_BUNDLE_URL);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nebulaforge-sdk.js';
    a.click();
    URL.revokeObjectURL(url);
  }

  const sdkCode = `<script src="/sdk/nebulaforge-sdk.js"><\/script>
<div id="star-map" style="width:800px;height:600px"></div>
<script>
  const sdk = NebulaForge.embed(
    document.getElementById('star-map'),
    {
      stars: [
        { id: '1', x: 0, y: 0, z: 0, color: '#3b82f6', label: 'Center' },
        { id: '2', x: 5, y: 3, z: -2, color: '#22d3ee', label: 'Star A' },
        { id: '3', x: -4, y: 1, z: 3, color: '#facc15', label: 'Star B' },
      ],
      background: '#0a0a1e',
      controls: true,
      onStarClick: (star) => console.log('Clicked:', star.label),
    }
  );

  // Layers are real scene groups. Hiding toggles group.visible on the star mesh.
  sdk.setLayerVisibility('stars', false);   // stars disappear
  sdk.setLayerVisibility('stars', true);    // stars reappear
  console.log(sdk.listLayers());            // -> ['stars', 'highlights', 'drawing']

  // Drawing lifecycle
  sdk.on('drawComplete', (r) => console.log('Drawn:', r));
  sdk.startDrawing('line');
  // While active, clicks on the canvas capture ground-plane points.
  // You can also push points programmatically:
  sdk.addDrawingPoint({ x: 0, y: 0, z: 0 });
  sdk.addDrawingPoint({ x: 5, y: 0, z: -2 });
  const result = sdk.stopDrawing();   // returns {mode, points, measurement}
  // sdk.cancelDrawing();             // discards current drawing instead

  // Highlight specific stars
  sdk.highlightFeatures(['1', '2']);

  // Clean up
  // sdk.destroy();
<\/script>`;
</script>

<div class="max-w-4xl mx-auto space-y-8">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-surface-50">Star Map SDK</h1>
      <p class="text-surface-400 mt-1">Embed the star map in any offline HTML page.</p>
      <p class="text-xs text-surface-500 mt-1">Spec: OpenAPI v{SDK_SPEC_VERSION}</p>
    </div>
    <div class="flex gap-2">
      <a
        href={SDK_SPEC_URL}
        target="_blank"
        rel="noreferrer"
        class="px-3 py-1.5 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 text-sm"
      >
        View Spec
      </a>
      <button
        class="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm"
        on:click={downloadSpec}
      >
        Download Spec
      </button>
      <button
        class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm"
        on:click={downloadBundle}
      >
        Download SDK Bundle
      </button>
    </div>
  </div>

  <div class="space-y-6">
    <section class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <h2 class="text-lg font-medium text-surface-200 mb-3">Quick Start</h2>
      <pre class="bg-surface-900 rounded-lg p-4 text-sm text-surface-300 overflow-auto">{sdkCode}</pre>
    </section>

    <section class="bg-surface-800 rounded-lg border border-surface-700 p-6">
      <h2 class="text-lg font-medium text-surface-200 mb-3">API Reference</h2>
      <div class="space-y-4 text-sm text-surface-300">
        <div>
          <h3 class="font-mono text-blue-400">NebulaForge.embed(element, config)</h3>
          <p class="mt-1">Creates a star map instance in the given DOM element. Returns an SDK instance.</p>
        </div>

        <div>
          <h3 class="font-mono text-blue-400">sdk.setLayerVisibility(layerId, visible)</h3>
          <p class="mt-1">
            Toggles the visibility of a real scene group. Known layers:
            <code class="text-surface-200">stars</code>,
            <code class="text-surface-200">highlights</code>,
            <code class="text-surface-200">drawing</code>.
            Unknown layer ids are accepted and remembered but produce no scene-side effect;
            <code class="text-surface-200">layerChange</code> events carry a
            <code class="text-surface-200">known</code> flag so embedders can detect this.
          </p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.getLayerVisibility(layerId) / sdk.listLayers()</h3>
          <p class="mt-1">Inspect current layer state. <code>listLayers()</code> returns the known layer ids.</p>
        </div>

        <div>
          <h3 class="font-mono text-blue-400">sdk.queryFeatures(filter)</h3>
          <p class="mt-1">
            Query stars by filter criteria. Currently the only supported filter is
            <code class="text-surface-200">ids</code> (array of star ids). An empty filter returns every
            star currently loaded. Returns an array of <code class="text-surface-200">CardFeature</code>
            objects.
          </p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.highlightFeatures(ids)</h3>
          <p class="mt-1">Highlight stars by ID. Non-matching stars are dimmed.</p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.clearHighlights()</h3>
          <p class="mt-1">Remove all highlights, restore original colors.</p>
        </div>

        <div>
          <h3 class="font-mono text-blue-400">sdk.startDrawing(mode)</h3>
          <p class="mt-1">
            Enter drawing mode (<code>'point' | 'line' | 'polygon'</code>). Clicks on the canvas are
            captured as ground-plane points and rendered into the <code>drawing</code> layer.
            Emits <code>drawStart</code>; each captured point emits <code>drawProgress</code>.
          </p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.addDrawingPoint(point)</h3>
          <p class="mt-1">Append a 3D point programmatically while a drawing is active.</p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.stopDrawing()</h3>
          <p class="mt-1">
            Finalize the drawing. Returns <code>{'{ mode, points, measurement }'}</code> and emits
            <code>drawComplete</code> with the same payload. For lines the measurement is total length;
            for polygons it is the shoelace area in the XZ plane; for points it is <code>null</code>.
          </p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.cancelDrawing()</h3>
          <p class="mt-1">Discard the in-progress drawing. Emits <code>drawCancelled</code>.</p>
        </div>

        <div>
          <h3 class="font-mono text-blue-400">sdk.measureDistance(points)</h3>
          <p class="mt-1">Calculate distance between an array of 3D points. Emits <code>measureComplete</code>.</p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.measureArea(points)</h3>
          <p class="mt-1">Calculate area of a polygon defined by 3D points. Emits <code>measureComplete</code>.</p>
        </div>

        <div>
          <h3 class="font-mono text-blue-400">sdk.on(event, handler)</h3>
          <p class="mt-1">Subscribe to events. Returns an unsubscribe function.</p>
          <p class="mt-1">
            Events: <code>starClick</code>,
            <code>drawStart</code>, <code>drawProgress</code>, <code>drawComplete</code>,
            <code>drawCancelled</code>, <code>measureComplete</code>, <code>layerChange</code>.
          </p>
        </div>
        <div>
          <h3 class="font-mono text-blue-400">sdk.destroy()</h3>
          <p class="mt-1">Clean up all resources and remove the canvas.</p>
        </div>
      </div>
    </section>
  </div>
</div>
