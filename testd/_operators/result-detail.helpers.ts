export function testResultDetail(metricName: string, purpose: string) {
  const normalizedMetricName = metricName.trim();
  const normalizedPurpose = purpose.trim();
  return normalizedPurpose ? `${normalizedMetricName}：${normalizedPurpose}` : normalizedMetricName;
}

export function resultDetailIncludesMetricName(detail: string, metricName: string) {
  return detail.includes(metricName.trim());
}
