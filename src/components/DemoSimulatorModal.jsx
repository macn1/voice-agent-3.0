import { useState } from 'react';
import { Play, Trash2, Zap } from 'lucide-react';
import {
  useGenerateDemoHistoryMutation,
  useListDemoScenariosQuery,
  useResetDemoCallsMutation,
  useSimulateDemoCallMutation,
} from '../store/api/analyticsApi';
import { useClearDemoUsageMutation } from '../store/api/customerApi';
import { useAgentOptions } from '../pages/customer/shared';
import { Button, ConfirmDialog, errMsg, Field, Modal, SegmentTabs, useToast } from './ui';
import { Select } from './forms';

export function DemoSimulatorModal({ open, onClose, defaultAgentId }) {
  const toast = useToast();
  const { options: agentOptions } = useAgentOptions();
  const scenariosQ = useListDemoScenariosQuery(undefined, { skip: !open });
  const [simulateCall, { isLoading: simBusy }] = useSimulateDemoCallMutation();
  const [generateHistory, { isLoading: genBusy }] = useGenerateDemoHistoryMutation();
  const [resetDemoCalls] = useResetDemoCallsMutation();
  const [clearDemoUsage] = useClearDemoUsageMutation();

  const [tab, setTab] = useState('simulate'); // 'simulate' | 'history' | 'reset'
  const [agentId, setAgentId] = useState(defaultAgentId || '');
  const [direction, setDirection] = useState('inbound');
  const [scenario, setScenario] = useState('');
  const [days, setDays] = useState('30');
  const [callsPerDay, setCallsPerDay] = useState('12');
  const [confirmReset, setConfirmReset] = useState(false);

  const rawScenarios = scenariosQ.data ?? [];
  const scenarioOptions = rawScenarios.map((s) => ({
    value: typeof s === 'string' ? s : s.key || s.id || s.name,
    label: typeof s === 'string' ? s.replace(/_/g, ' ') : s.label || s.name || s.key,
  }));

  const handleSimulate = async () => {
    const chosenAgent = agentId || agentOptions[0]?.value;
    if (!chosenAgent) {
      toast('Please create or select an agent first', 'error');
      return;
    }
    try {
      const res = await simulateCall({
        agent_id: chosenAgent,
        direction,
        scenario: scenario || undefined,
      }).unwrap();
      toast(`Simulated call created: ${res.outcome || res.status || 'success'}`);
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const handleGenerateHistory = async () => {
    try {
      await generateHistory({
        days: Number(days) || 30,
        calls_per_day: Number(callsPerDay) || 12,
      }).unwrap();
      toast(`Generated ${days} days of call history across your agents`);
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const handleReset = async () => {
    try {
      await resetDemoCalls().unwrap();
      await clearDemoUsage().unwrap().catch(() => {});
      toast('All simulated calls and demo usage reset');
      setConfirmReset(false);
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Demo Call Simulator"
        description="Generate realistic call transcripts, analysis, and usage data to showcase platform capabilities."
        footer={
          tab === 'simulate' ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" icon={<Play />} loading={simBusy} onClick={handleSimulate}>
                Simulate call
              </Button>
            </>
          ) : tab === 'history' ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" icon={<Zap />} loading={genBusy} onClick={handleGenerateHistory}>
                Generate history
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Close</Button>
              <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmReset(true)}>
                Reset all demo calls
              </Button>
            </>
          )
        }
      >
        <SegmentTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'simulate', label: 'Single Call' },
            { value: 'history', label: 'Batch History' },
            { value: 'reset', label: 'Reset Data' },
          ]}
        />

        {tab === 'simulate' && (
          <div className="stack" style={{ marginTop: 16 }}>
            <Field label="Voice Agent" hint="The simulated call will use this agent's identity and flow.">
              <Select
                value={agentId || agentOptions[0]?.value || ''}
                options={agentOptions}
                placeholder="Select agent"
                onChange={(e) => setAgentId(e.target.value)}
              />
            </Field>

            <Field label="Call Direction">
              <Select
                value={direction}
                options={[
                  { value: 'inbound', label: 'Inbound (Caller rings agent)' },
                  { value: 'outbound', label: 'Outbound (Agent dials lead)' },
                ]}
                onChange={(e) => setDirection(e.target.value)}
              />
            </Field>

            <Field label="Conversation Scenario" hint="Determines the caller's intent and outcome.">
              <Select
                value={scenario}
                options={[
                  { value: '', label: 'Random realistic scenario' },
                  ...scenarioOptions,
                ]}
                onChange={(e) => setScenario(e.target.value)}
              />
            </Field>

            <div className="banner info small" style={{ marginTop: 8 }}>
              A simulated call generates an instant transcript, audio turnaround data, sentiment, extracted fields, and updates billing minutes.
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="form-grid">
              <Field label="Days of history" hint="Spread calls over the last N days (max 90)">
                <Select
                  value={days}
                  options={[
                    { value: '7', label: '7 days (quick demo)' },
                    { value: '14', label: '14 days' },
                    { value: '30', label: '30 days (recommended)' },
                    { value: '60', label: '60 days' },
                  ]}
                  onChange={(e) => setDays(e.target.value)}
                />
              </Field>

              <Field label="Calls per day" hint="Volume of calls distributed each day">
                <Select
                  value={callsPerDay}
                  options={[
                    { value: '5', label: '5 calls/day (light)' },
                    { value: '12', label: '12 calls/day (standard)' },
                    { value: '25', label: '25 calls/day (busy)' },
                    { value: '45', label: '45 calls/day (high volume)' },
                  ]}
                  onChange={(e) => setCallsPerDay(e.target.value)}
                />
              </Field>
            </div>

            <div className="banner warn small" style={{ marginTop: 8 }}>
              This seeds call records across all your agents, populating analytics charts, conversion rates, and dashboard timeseries graphs.
            </div>
          </div>
        )}

        {tab === 'reset' && (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="banner warn" style={{ margin: 0 }}>
              Resetting demo calls removes all simulated calls from the call log and clears their billed call minutes from the billing record.
            </div>
            <p className="muted small">
              Real inbound and live calls will not be affected. Only calls flagged with <code>is_simulated = true</code> are removed.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        danger
        title="Reset all simulated calls?"
        description="This will delete all simulated call logs, transcripts, and simulated usage minutes. This cannot be undone."
        confirmLabel="Reset demo data"
        onConfirm={handleReset}
      />
    </>
  );
}
