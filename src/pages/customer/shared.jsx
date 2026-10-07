import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhoneCall, PhoneOff } from 'lucide-react';
import { useGetAgentSectionQuery, useListAgentsQuery } from '../../store/api/flowApi';
import { useGetCallStatusQuery, useHangupCallMutation, useListNumbersQuery, useStartCallMutation } from '../../store/api/callsApi';
import { Button, errMsg, Field, Input, Modal, StatusBadge } from '../../components/ui';
import { Select } from '../../components/forms';

/** Agents for pickers; empty while the flow service is unavailable. */
export function useAgentOptions() {
  const s = useListAgentsQuery({ limit: 200 });
  const list = s.data?.items ?? [];
  return {
    agents: list,
    options: list.map((a) => ({ value: a.id, label: a.name })),
    loading: s.isLoading,
  };
}

export function useNumberOptions() {
  const s = useListNumbersQuery();
  const list = s.data ?? [];
  return {
    numbers: list,
    options: list.map((n) => ({ value: n.id, label: n.e164 })),
  };
}

export const E164 = /^\+[1-9]\d{7,14}$/;

const LIVE_STATES = ['queued', 'ringing', 'in_progress'];

/** CALL-02: "Call a number" with live status (queued → ringing → in progress → done). */
export function CallNumberDialog({ open, onClose, agentId, defaultTo }) {
  const { options } = useAgentOptions();
  const nums = useNumberOptions();
  const [agent, setAgent] = useState(agentId ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(null);
  const [startCall, { isLoading: busy }] = useStartCallMutation();
  const [hangupCall] = useHangupCallMutation();
  // Input variables of the chosen agent.
  const varsQ = useGetAgentSectionQuery({ id: agent, section: 'variables' }, { skip: !agent });
  const vars = (agent && varsQ.data ? varsQ.data : []).filter((x) => x.direction === 'input');
  // Live status: poll every 2s while the call is queued/ringing/in progress.
  const [polling, setPolling] = useState(0);
  const statusQ = useGetCallStatusQuery(started?.id, { skip: !started, pollingInterval: polling });
  const call = statusQ.data ?? started;
  useEffect(() => setPolling(call && LIVE_STATES.includes(call.status) ? 2000 : 0), [call]);

  useEffect(() => {
    if (open) {
      setAgent(agentId ?? '');
      setTo(defaultTo ?? '');
      setValues({});
      setStarted(null);
      setError(null);
    }
  }, [open, agentId, defaultTo]);

  const start = async () => {
    if (!agent) return setError('Pick an agent');
    if (!E164.test(to.trim())) return setError('Enter the number in international format, e.g. +919876543210');
    const missing = vars.filter((v) => v.required && !values[v.name]);
    if (missing.length) return setError(`Fill in: ${missing.map((m) => m.name).join(', ')}`);
    setError(null);
    try {
      setStarted(
        await startCall({
          agent_id: agent,
          from_number_id: from || undefined,
          to: to.trim(),
          variables: values,
        }).unwrap(),
      );
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Call a number"
      description="The agent's live version places the call. Do-not-call and calling-hour rules apply."
      footer={
        call ? (
          <>
            {LIVE_STATES.includes(call.status) && (
              <Button
                variant="danger"
                icon={<PhoneOff />}
                onClick={() =>
                  hangupCall(call.id)
                    .unwrap()
                    .then(setStarted)
                    .catch((e) => setError(errMsg(e)))
                }
              >
                Hang up
              </Button>
            )}
            <Link to={`/calls/${call.id}`} className="btn">
              Open call
            </Link>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<PhoneCall />} loading={busy} onClick={start}>
              Start call
            </Button>
          </>
        )
      }
    >
      {call ? (
        <div
          className="stack"
          style={{
            alignItems: 'center',
            textAlign: 'center',
            padding: '12px 0',
          }}
        >
          <div className="steps" style={{ justifyContent: 'center', marginBottom: 6 }}>
            {['queued', 'ringing', 'in_progress', 'completed'].map((s, i, arr) => {
              const idx = arr.indexOf(LIVE_STATES.includes(call.status) ? call.status : 'completed');
              return (
                <span key={s} className={`step ${i <= idx ? 'on' : ''}`}>
                  <b>{i + 1}</b>
                  {s.replace('_', ' ')}
                </span>
              );
            })}
          </div>
          <StatusBadge status={call.status} />
          <div className="muted small">
            {call.to_number} · {call.agent_name}
          </div>
        </div>
      ) : (
        <div className="stack">
          {error && <div className="alert-inline">{error}</div>}
          <Field label="Agent">
            <Select value={agent} options={options} placeholder="Choose an agent" onChange={(e) => setAgent(e.target.value)} />
          </Field>
          <div className="form-grid">
            <Field label="From number" hint="Optional — defaults to the agent's number">
              <Select value={from} options={nums.options} placeholder="Default" onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To number">
              <Input className="mono" placeholder="+919876543210" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {vars.length > 0 && (
            <div className="perm-group" style={{ paddingTop: 14 }}>
              <h4>Call variables</h4>
              <div className="form-grid">
                {vars.map((v) => (
                  <Field key={v.name} label={`${v.name}${v.required ? ' *' : ''}`} hint={v.description}>
                    <Input value={values[v.name] ?? ''} placeholder={v.default} onChange={(e) => setValues((x) => ({ ...x, [v.name]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function duration(sec) {
  const s = Number(sec ?? 0);
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const OUTCOME_TONE = (success) => (success === true ? 'green' : success === false ? 'amber' : '');
