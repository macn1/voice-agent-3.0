import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Globe, HelpCircle, LibraryBig, MessageCircleQuestion, Plus, RefreshCw, Search, Trash2, Type, Upload } from 'lucide-react';
import {
  useAddSourceMutation,
  useCreateKnowledgeBaseMutation,
  useListKnowledgeBasesQuery,
  useListSourcesQuery,
  useQueryKnowledgeMutation,
  useRemoveSourceMutation,
  useResyncSourceMutation,
} from '../../../store/api/flowApi';
import { useListUnansweredQuestionsQuery } from '../../../store/api/analyticsApi';
import { date, dateTime, titleCase } from '../../../lib/format';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, SegmentTabs, StatusBadge, useToast } from '../../../components/ui';
import { Select, Textarea } from '../../../components/forms';

/** P-12 Knowledge list (KNW-01). */
export function KnowledgeListPage() {
  const navigate = useNavigate();
  const list = useListKnowledgeBasesQuery();
  const [createKnowledgeBase] = useCreateKnowledgeBaseMutation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Knowledge base"
        description="Documents, websites, FAQs and notes your agents answer from. Attach a knowledge base to an agent on its Knowledge tab."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
            New knowledge base
          </Button>
        }
      />

      <div className="card">
        <Async state={list}>
          {(kbs) =>
            kbs.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Sources</th>
                    <th className="num">Agents using it</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {kbs.map((kb) => (
                    <tr key={kb.id} className="clickable" onClick={() => navigate(`/knowledge/${kb.id}`)}>
                      <td>
                        <div className="cell-main">{kb.name}</div>
                        {kb.description && <div className="cell-sub">{kb.description}</div>}
                      </td>
                      <td className="num">{kb.sources_count}</td>
                      <td className="num">{kb.agents_count}</td>
                      <td className="muted">{date(kb.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<LibraryBig />} title="No knowledge yet" description="Create a knowledge base, then add files, a website or FAQs." />
            )
          }
        </Async>
      </div>
      <UnansweredCard />
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New knowledge base"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!name.trim()) return setError('Give it a name');
                setBusy(true);
                setError(null);
                try {
                  const kb = await createKnowledgeBase({
                    name: name.trim(),
                    description: desc.trim() || undefined,
                  }).unwrap();
                  navigate(`/knowledge/${kb.id}`);
                } catch (e) {
                  setError(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="stack">
          {error && <div className="alert-inline">{error}</div>}
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Clinic handbook" />
          </Field>
          <Field label="Description">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

const SOURCE_ICON = { file: FileText, url: Globe, faq: HelpCircle, text: Type };

/** P-12 Knowledge detail: sources, ask a question, unanswered (KNW-01, KNW-02). */
export function KnowledgeDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const kbs = useListKnowledgeBasesQuery();
  const [poll, setPoll] = useState(0);
  const sources = useListSourcesQuery(id, { pollingInterval: poll });
  const [resyncSource] = useResyncSourceMutation();
  const [removeSource] = useRemoveSourceMutation();
  const [adding, setAdding] = useState(null);
  const kb = kbs.data?.find((k) => k.id === id);

  // Refresh while anything is still processing.
  useEffect(() => setPoll(sources.data?.some((s) => s.status === 'processing') ? 4000 : 0), [sources.data]);

  return (
    <>
      <Link to="/knowledge" className="back-link">
        <ArrowLeft /> Knowledge base
      </Link>
      <PageHeader eyebrow="Knowledge base" title={kb?.name ?? 'Knowledge base'} description={kb?.description} />
      <div className="card">
        <div className="card-head">
          <h2>Sources</h2>
          <div className="row wrap">
            <Button size="sm" icon={<Upload />} onClick={() => setAdding('file')}>
              Upload files
            </Button>
            <Button size="sm" icon={<Globe />} onClick={() => setAdding('url')}>
              Website
            </Button>
            <Button size="sm" icon={<HelpCircle />} onClick={() => setAdding('faq')}>
              FAQs
            </Button>
            <Button size="sm" icon={<Type />} onClick={() => setAdding('text')}>
              Paste text
            </Button>
          </div>
        </div>
        <Async state={sources}>
          {(list) =>
            list.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Re-sync</th>
                    <th>Last synced</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const Icon = SOURCE_ICON[s.type] ?? FileText;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="row">
                            <Icon size={16} />
                            <div>
                              <div className="cell-main">{s.title}</div>
                              <div className="cell-sub">
                                {titleCase(s.type)}
                                {s.url ? ` · ${s.url}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusBadge
                            status={s.status === 'ready' ? 'active' : s.status}
                            label={s.status === 'processing' ? 'Processing…' : titleCase(s.status)}
                          />
                          {s.error && (
                            <div className="cell-sub" style={{ color: 'var(--red)', maxWidth: 320 }}>
                              {s.error}
                            </div>
                          )}
                        </td>
                        <td className="muted">{s.resync_schedule ? titleCase(s.resync_schedule) : '—'}</td>
                        <td className="muted">{dateTime(s.last_synced_at)}</td>
                        <td className="actions">
                          {(s.type === 'url' || s.status === 'failed') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RefreshCw />}
                              onClick={() =>
                                resyncSource({ kbId: id, id: s.id })
                                  .unwrap()
                                  .then(() => toast('Re-sync started'))
                                  .catch((e) => toast(errMsg(e), 'error'))
                              }
                            >
                              Re-sync
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 />}
                            onClick={() =>
                              removeSource({ kbId: id, id: s.id })
                                .unwrap()
                                .catch((e) => toast(errMsg(e), 'error'))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No sources yet" description="Upload files, add your website, write FAQs or paste text." />
            )
          }
        </Async>
      </div>
      <AskPanel kbId={id} />
      <AddSourceModal kbId={id} type={adding} onClose={() => setAdding(null)} onAdded={() => toast('Source added — processing')} />
    </>
  );
}

function AskPanel({ kbId }) {
  const [queryKnowledge] = useQueryKnowledgeMutation();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <div>
          <h2>Ask a question</h2>
          <div className="card-sub">Check what an agent would answer and which passages it would use.</div>
        </div>
      </div>
      <div className="card-pad stack">
        <form
          className="prompt-box"
          style={{ marginTop: 0, height: 52 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!q.trim()) return;
            setBusy(true);
            setError(null);
            try {
              setRes(await queryKnowledge({ kbId, question: q.trim() }).unwrap());
            } catch (err) {
              setError(errMsg(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Search aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Do you accept insurance?" />
          <button className="round-ink" style={{ width: 36, height: 36 }} disabled={busy || !q.trim()} aria-label="Ask">
            {busy ? <span className="spinner" /> : <MessageCircleQuestion />}
          </button>
        </form>
        {error && <div className="alert-inline">{error}</div>}
        {res && (
          <>
            <div className="bubble them" style={{ maxWidth: '100%' }}>
              {res.answer}
            </div>
            <div className="field-label">Matched passages</div>
            {res.passages.length ? (
              res.passages.map((p, i) => (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div className="row between small">
                    <b>{p.source}</b>
                    <Badge plain>{Math.round(p.score * 100)}% match</Badge>
                  </div>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    {p.text}
                  </p>
                </div>
              ))
            ) : (
              <p className="muted small">Nothing matched — consider adding an FAQ.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** KNW-02.3 unanswered questions from real calls, with "Add as FAQ". */
function UnansweredCard() {
  const toast = useToast();
  const list = useListUnansweredQuestionsQuery();
  const kbs = useListKnowledgeBasesQuery();
  const [addSource] = useAddSourceMutation();
  const [faqFor, setFaqFor] = useState(null);
  const [kb, setKb] = useState('');
  const [answer, setAnswer] = useState('');
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <div>
          <h2>Unanswered questions</h2>
          <div className="card-sub">Real questions callers asked that agents couldn't answer.</div>
        </div>
      </div>
      <Async state={list}>
        {(qs) =>
          qs.filter((q) => !q.resolved).length ? (
            <table className="table">
              <tbody>
                {qs
                  .filter((q) => !q.resolved)
                  .map((q) => (
                    <tr key={q.id}>
                      <td>
                        <div className="cell-main">{q.question}</div>
                        <div className="cell-sub">
                          {q.agent_name ?? 'Agent'} · asked {q.occurrences}× · last {dateTime(q.last_seen_at)}
                          {q.example_call_id && (
                            <>
                              {' · '}
                              <Link to={`/calls/${q.example_call_id}`}>example call</Link>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="actions">
                        <Button
                          size="sm"
                          icon={<Plus />}
                          onClick={() => {
                            setFaqFor(q.question);
                            setAnswer('');
                            setKb(kbs.data?.[0]?.id ?? '');
                          }}
                        >
                          Add as FAQ
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Nothing unanswered" description="Questions agents couldn't answer will show up here." />
          )
        }
      </Async>
      <Modal
        open={!!faqFor}
        onClose={() => setFaqFor(null)}
        title="Add as FAQ"
        description={faqFor ?? undefined}
        footer={
          <>
            <Button onClick={() => setFaqFor(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!kb || !answer.trim()}
              onClick={async () => {
                try {
                  await addSource({
                    kbId: kb,
                    type: 'faq',
                    title: faqFor.slice(0, 80),
                    content: [{ question: faqFor, answer: answer.trim() }],
                  }).unwrap();
                  toast('FAQ added');
                  setFaqFor(null);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Add FAQ
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Knowledge base">
            <Select
              value={kb}
              options={(kbs.data ?? []).map((k) => ({
                value: k.id,
                label: k.name,
              }))}
              placeholder="Choose"
              onChange={(e) => setKb(e.target.value)}
            />
          </Field>
          <Field label="Answer">
            <Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function AddSourceModal({ kbId, type, onClose, onAdded }) {
  const [addSource] = useAddSourceMutation();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState('site');
  const [schedule, setSchedule] = useState('weekly');
  const [text, setText] = useState('');
  const [faqs, setFaqs] = useState([{ question: '', answer: '' }]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (type) {
      setTitle('');
      setUrl('');
      setText('');
      setFaqs([{ question: '', answer: '' }]);
      setFiles([]);
      setError(null);
    }
  }, [type]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (type === 'file') {
        if (!files.length) throw new Error('Choose at least one file');
        for (const f of files) {
          // Creates the source and uploads the file to its signed URL.
          await addSource({ kbId, type: 'file', title: f.name, file: f }).unwrap();
        }
      } else if (type === 'url') {
        if (!/^https?:\/\/.+\..+/.test(url.trim())) throw new Error('Enter a full URL');
        await addSource({
          kbId,
          type: 'url',
          title: title.trim() || url.trim(),
          url: url.trim(),
          content: { scope },
          resync_schedule: schedule || null,
        }).unwrap();
      } else if (type === 'faq') {
        const pairs = faqs.filter((f) => f.question.trim() && f.answer.trim());
        if (!pairs.length) throw new Error('Add at least one question with an answer');
        await addSource({
          kbId,
          type: 'faq',
          title: title.trim() || 'FAQs',
          content: pairs,
        }).unwrap();
      } else if (type === 'text') {
        if (!text.trim()) throw new Error('Paste some text');
        await addSource({
          kbId,
          type: 'text',
          title: title.trim() || 'Notes',
          content: text,
        }).unwrap();
      }
      onAdded();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    file: 'Upload files',
    url: 'Add a website',
    faq: 'Add FAQs',
    text: 'Paste text',
  };
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      wide={type === 'faq'}
      title={type ? titles[type] : ''}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Add
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        {type === 'file' && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.html"
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
            <button
              type="button"
              className="card"
              style={{
                padding: 28,
                textAlign: 'center',
                borderStyle: 'dashed',
                cursor: 'pointer',
              }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={22} />
              <div style={{ marginTop: 8, fontWeight: 500 }}>Choose files</div>
              <div className="muted small">PDF, Word, text, Markdown, CSV</div>
            </button>
            {files.map((f) => (
              <div key={f.name} className="row between small">
                <span>{f.name}</span>
                <span className="muted">{Math.round(f.size / 1024)} KB</span>
              </div>
            ))}
          </>
        )}
        {type === 'url' && (
          <>
            <Field label="Website URL">
              <Input autoFocus placeholder="https://example.com/help" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <SegmentTabs
              value={scope}
              onChange={setScope}
              items={[
                { value: 'site', label: 'Whole site' },
                { value: 'page', label: 'This page only' },
              ]}
            />

            <Field label="Re-sync">
              <Select
                value={schedule}
                options={[
                  { value: '', label: 'Never' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </Field>
          </>
        )}
        {(type === 'faq' || type === 'text') && (
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'faq' ? 'Front-desk FAQs' : 'Notes'} />
          </Field>
        )}
        {type === 'text' && (
          <Field label="Text">
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        {type === 'faq' && (
          <>
            {faqs.map((f, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <Input
                  placeholder="Question"
                  value={f.question}
                  onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                />
                <Textarea
                  rows={2}
                  style={{ marginTop: 8 }}
                  placeholder="Answer"
                  value={f.answer}
                  onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                />
              </div>
            ))}
            <div>
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}>
                Add question
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
