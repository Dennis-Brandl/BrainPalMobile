// PDF Report Template: Shared HTML builder for PDF export.
// Used by both mobile (pdf-report-service.ts) and web (pdf-report-service.web.ts).
// No platform-specific dependencies -- pure string template functions.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportData {
  workflowName: string;
  instanceId: string;
  state: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
  steps: ReportStep[];
}

export interface ReportStep {
  name: string;
  stepType: string;
  state: string;
  duration: string;
  userInputs: string | null;
  resolvedOutputs: string | null;
  isChildStep: boolean;
  childWorkflowName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function outcomeColor(state: string): string {
  if (state === 'COMPLETED') return '#10B981';
  if (state === 'ABORTED' || state === 'STOPPED') return '#EF4444';
  return '#6B7280';
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Format step type: USER_INTERACTION -> User Interaction */
function formatStepType(stepType: string): string {
  return stepType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Parse user inputs JSON into human-readable "field: value" lines */
function parseUserInputs(json: string | null): string {
  if (!json) return '';
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(data)
      .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(String(value ?? ''))}`)
      .join('<br/>');
  } catch {
    return '';
  }
}

/** Parse resolved outputs JSON for branching decisions */
function parseBranchingDecision(json: string | null): string {
  if (!json) return '';
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (data.matchedConnectionId) {
      return `Branch: ${escapeHtml(String(data.matchedConnectionId))}`;
    }
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Step row builder
// ---------------------------------------------------------------------------

function buildStepRow(step: ReportStep): string {
  const indent = step.isChildStep ? 'padding-left: 24px;' : '';
  const childLabel = step.isChildStep && step.childWorkflowName
    ? `<div style="font-size: 10px; color: #6B7280; margin-bottom: 2px;">Child: ${escapeHtml(step.childWorkflowName)}</div>`
    : '';

  const details = parseUserInputs(step.userInputs) || parseBranchingDecision(step.resolvedOutputs) || '--';

  return `
    <tr style="border-bottom: 1px solid #E5E7EB;">
      <td style="padding: 10px; ${indent}">
        ${childLabel}
        <div style="font-weight: 500;">${escapeHtml(step.name)}</div>
        <div style="font-size: 11px; color: #6B7280;">${escapeHtml(formatStepType(step.stepType))}</div>
      </td>
      <td style="padding: 10px; color: ${outcomeColor(step.state)}; font-weight: 600;">
        ${escapeHtml(step.state)}
      </td>
      <td style="padding: 10px; color: #6B7280;">
        ${escapeHtml(step.duration)}
      </td>
      <td style="padding: 10px; font-size: 12px; color: #374151;">
        ${details}
      </td>
    </tr>`;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

export function buildReportHtml(data: ReportData): string {
  const stepsHtml = data.steps.map((step) => buildStepRow(step)).join('');
  const runId = data.instanceId.slice(0, 8);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: A4 portrait; margin: 20mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #111827;
      font-size: 14px;
      line-height: 1.5;
    }

    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 30%;
    }
    .cover h1 {
      font-size: 28px;
      color: #111827;
      margin: 0 0 8px 0;
    }
    .cover .subtitle {
      font-size: 16px;
      color: #6B7280;
      margin: 0 0 40px 0;
    }
    .cover table {
      margin: 0 auto;
      border-collapse: collapse;
    }
    .cover td {
      padding: 8px 16px;
      text-align: left;
    }
    .cover .label {
      color: #6B7280;
      font-weight: 500;
    }

    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      border-bottom: 2px solid #2563EB;
      padding-bottom: 8px;
      margin: 24px 0 16px 0;
    }

    .step-table {
      width: 100%;
      border-collapse: collapse;
    }
    .step-table thead tr {
      background: #F9FAFB;
      text-align: left;
    }
    .step-table th {
      padding: 10px;
      border-bottom: 2px solid #E5E7EB;
      font-weight: 600;
      font-size: 13px;
      color: #374151;
    }

    .footer {
      position: fixed;
      bottom: 10mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 10px;
      color: #6B7280;
    }
  </style>
</head>
<body>
  <!-- Cover page -->
  <div class="cover">
    <h1>${escapeHtml(data.workflowName)}</h1>
    <p class="subtitle">Execution Report</p>
    <table>
      <tr>
        <td class="label">Run ID:</td>
        <td>${escapeHtml(runId)}</td>
      </tr>
      <tr>
        <td class="label">Date:</td>
        <td>${escapeHtml(formatDate(data.startedAt))}</td>
      </tr>
      <tr>
        <td class="label">Outcome:</td>
        <td style="color: ${outcomeColor(data.state)}; font-weight: 600;">
          ${escapeHtml(data.state)}
        </td>
      </tr>
      <tr>
        <td class="label">Duration:</td>
        <td>${escapeHtml(data.duration)}</td>
      </tr>
    </table>
  </div>

  <!-- Step Summary -->
  <h2 class="section-title">Step Summary</h2>
  <table class="step-table">
    <thead>
      <tr>
        <th>Step</th>
        <th>Outcome</th>
        <th>Duration</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${stepsHtml}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">Generated by BrainPal</div>
</body>
</html>`;
}
