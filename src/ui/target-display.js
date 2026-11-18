// Pure display helpers shared by the HUD and headless regression tests.
export function targetOnScreen(cameraZ, projected) {
  return cameraZ < 0 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
    && projected.z >= -1 && projected.z <= 1;
}

export function targetHealthMarkup(health) {
  const percent = value => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0;
  const shield = percent(health.shield), hull = percent(health.hull);
  const row = (kind, value) => `<span class="target-health-row"><span class="target-track target-${kind}"><i style="width:${value}%"></i></span><span class="target-percent">${value}%</span></span>`;
  return `<span class="target-health" aria-label="Shield ${shield}%, hull ${hull}%">${row('shield', shield)}${row('hull', hull)}</span>`;
}
