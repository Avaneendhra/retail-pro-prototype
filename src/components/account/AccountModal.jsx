import React, { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { deviceCode } from '../../store/ids';
import { fmtDate, fmtTime } from '../../lib/format';
import Modal from '../common/Modal';
import { syncLabel } from './syncLabel';
import { CloudSignIn, CreateShop, CloudTeam, CloudPassword } from './CloudAccount';

const MIN_PASSWORD = 8;
const KNOWN_ERRORS = ['network', 'bad_credentials', 'login_taken', 'too_many_attempts', 'signup_closed', 'invalid_login', 'short_password', 'insecure_context', 'team_full', 'forbidden', 'bad_code'];

/** Turns a failure into a sentence in the user's language. */
function explain(t, error, overrides = {}) {
  const code = overrides[error?.code] || error?.code;
  return KNOWN_ERRORS.includes(code) ? t(`account.err.${code}`) : (error?.status ? error.message : t('account.err.generic'));
}

function Field({ label, hint, ...input }) {
  const id = useId();
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="form-input" {...input} />
      {hint && <p className="text-xs text-[var(--text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

/** A form that shows one error in words and a busy state while it works. */
function useSubmit(action, overrides) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(explain(t, failure, overrides));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

const shortPassword = (password) => {
  if (password.length < MIN_PASSWORD) throw Object.assign(new Error('short'), { code: 'short_password' });
};

function SubmitRow({ busy, error, label }) {
  const { t } = useTranslation();
  return (
    <>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-cta w-full" disabled={busy}>{busy ? t('account.working') : label}</button>
    </>
  );
}

/* ── not signed in ────────────────────────────────────────────── */

function SignInForm() {
  const { t } = useTranslation();
  const { signIn } = useAccount();
  const { showToast } = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const form = useSubmit(async () => {
    await signIn({ login, password });
    showToast(t('account.signedIn'), 'success');
  });
  return (
    <form className="space-y-4" onSubmit={form.submit}>
      <Field label={t('account.login')} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
      <Field label={t('account.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      <SubmitRow {...form} label={t('account.signIn')} />
    </form>
  );
}

function CreateForm({ onRecoveryCode }) {
  const { t } = useTranslation();
  const { signUp } = useAccount();
  const { shopName: currentName } = useInventory();
  const [shopName, setShopName] = useState(currentName);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const form = useSubmit(async () => {
    shortPassword(password);
    const { recoveryCode } = await signUp({ shopName: shopName.trim(), name: name.trim(), login, password, keepDeviceData: keep });
    onRecoveryCode(recoveryCode);
  });
  return (
    <form className="space-y-4" onSubmit={form.submit}>
      <Field label={t('account.shopName')} value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={80} required />
      <Field label={t('account.yourName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required />
      <Field label={t('account.login')} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
      <Field label={t('account.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={t('account.passwordHint')} required />
      <fieldset className="space-y-2">
        {[[true, 'keepData'], [false, 'startEmpty']].map(([value, key]) => (
          <label key={key} className="choice-row">
            <input type="radio" name="device-data" checked={keep === value} onChange={() => setKeep(value)} />
            <span>
              <span className="block font-medium">{t(`account.${key}`)}</span>
              <span className="block text-xs text-[var(--text-muted)]">{t(`account.${key}Hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitRow {...form} label={t('account.create')} />
    </form>
  );
}

function ForgotForm({ onRecoveryCode }) {
  const { t } = useTranslation();
  const { recover } = useAccount();
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const form = useSubmit(async () => {
    shortPassword(password);
    const { recoveryCode } = await recover({ login, recoveryCode: code.trim(), password });
    onRecoveryCode(recoveryCode);
  }, { bad_credentials: 'bad_code', invalid_input: 'bad_code' });
  return (
    <form className="space-y-4" onSubmit={form.submit}>
      <Field label={t('account.login')} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
      <Field label={t('account.recoveryCode')} value={code} onChange={(e) => setCode(e.target.value)} className="form-input font-mono uppercase" placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" required />
      <Field label={t('account.newPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={t('account.passwordHint')} required />
      <SubmitRow {...form} label={t('account.resetPassword')} />
    </form>
  );
}

function SignedOut({ onRecoveryCode }) {
  const { t } = useTranslation();
  const { apiAvailable, checkServer } = useAccount();
  const [tab, setTab] = useState('signIn');
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    await checkServer();
    setChecking(false);
  }, [checkServer]);
  useEffect(() => { check(); }, [check]);

  if (checking && apiAvailable !== true) return <p role="status" className="text-[var(--text-secondary)]">{t('account.checking')}</p>;
  if (!apiAvailable) {
    return (
      <div>
        <h3 className="font-semibold text-lg">{t('account.noServerTitle')}</h3>
        <p className="text-[var(--text-secondary)] mt-2 leading-relaxed">{t('account.noServerBody')}</p>
        <button className="btn btn-secondary mt-5" onClick={check}>{t('account.retry')}</button>
      </div>
    );
  }
  const tabs = [['signIn', 'tabSignIn'], ['create', 'tabCreate'], ['forgot', 'tabForgot']];
  return (
    <div>
      <p className="text-[var(--text-secondary)] -mt-2 mb-5 leading-relaxed">{t('account.localBody')}</p>
      <div className="segmented mb-5" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t(`account.${label}`)}</button>
        ))}
      </div>
      {tab === 'signIn' && <SignInForm />}
      {tab === 'create' && <CreateForm onRecoveryCode={onRecoveryCode} />}
      {tab === 'forgot' && <ForgotForm onRecoveryCode={onRecoveryCode} />}
    </div>
  );
}

/* ── signed in ────────────────────────────────────────────────── */

function Team() {
  const { t } = useTranslation();
  const { team } = useAccount();
  const { showToast } = useToast();
  const [members, setMembers] = useState(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [listError, setListError] = useState('');

  const load = useCallback(() => team.list().then(setMembers, (failure) => setListError(explain(t, failure))), [team, t]);
  useEffect(() => { load(); }, [load]);

  const form = useSubmit(async () => {
    shortPassword(password);
    const member = await team.add({ name: name.trim(), login, password });
    setName(''); setLogin(''); setPassword('');
    showToast(t('account.staffAdded', { name: member.name }), 'success');
    await load();
  });

  const change = async (member, patch, done) => {
    try {
      await team.update(member.id, { login: member.login, ...patch });
      if (done) showToast(done, 'success');
      await load();
    } catch (failure) {
      showToast(explain(t, failure), 'error');
    }
  };
  const reset = (member) => {
    const next = window.prompt(t('account.newPassword'));
    if (next === null) return;
    if (next.length < MIN_PASSWORD) { showToast(t('account.err.short_password'), 'error'); return; }
    change(member, { password: next }, t('account.staffReset'));
  };

  const staff = (members || []).filter((m) => m.role === 'staff');
  return (
    <section>
      <h3 className="font-semibold mb-3">{t('account.team')}</h3>
      {listError && <p className="text-sm text-[var(--danger)] mb-3">{listError}</p>}
      {members && staff.length === 0 && <p className="text-sm text-[var(--text-secondary)] mb-3">{t('account.teamEmpty')}</p>}
      {staff.length > 0 && (
        <div className="card-inset divide-y divide-[var(--border)] mb-4">
          {staff.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{m.name} {m.disabled && <span className="badge badge-warning ml-1">{t('account.disabled')}</span>}</span>
                <span className="block text-xs text-[var(--text-muted)] font-mono truncate">{m.login}</span>
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => reset(m)}>{t('account.resetStaff')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => change(m, { disabled: !m.disabled })}>{m.disabled ? t('account.enable') : t('account.disable')}</button>
            </div>
          ))}
        </div>
      )}
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={form.submit}>
        <Field label={t('account.staffName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        <Field label={t('account.login')} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" required />
        <Field label={t('account.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <div className="flex items-end"><button type="submit" className="btn btn-primary w-full" disabled={form.busy}>{t('account.add')}</button></div>
        {form.error && <p role="alert" className="text-sm text-[var(--danger)] sm:col-span-2">{form.error}</p>}
      </form>
    </section>
  );
}

function ChangePassword() {
  const { t } = useTranslation();
  const { changePassword } = useAccount();
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const form = useSubmit(async () => {
    shortPassword(next);
    await changePassword({ current, next });
    setCurrent(''); setNext('');
    showToast(t('account.passwordChanged'), 'success');
  });
  return (
    <details>
      <summary className="font-semibold cursor-pointer">{t('account.changePassword')}</summary>
      <form className="space-y-3 mt-3" onSubmit={form.submit}>
        <Field label={t('account.currentPassword')} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <Field label={t('account.newPassword')} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint={t('account.passwordHint')} required />
        <SubmitRow {...form} label={t('account.changePassword')} />
      </form>
    </details>
  );
}

function SignedIn() {
  const { t } = useTranslation();
  const { account, sync, syncNow, signOut, retryRejected, discardRejected, cloud } = useAccount();
  const { user, shop, device } = account;

  const leave = () => {
    const question = sync.pending ? t('account.signOutPending', { count: sync.pending }) : t('account.signOutConfirm');
    if (window.confirm(question)) signOut();
  };

  return (
    <div className="space-y-6">
      <dl className="card-inset divide-y divide-[var(--border)] text-sm">
        {[
          [t('account.shop'), shop.name],
          [t('account.user'), `${user.name} · ${t(`account.${user.role}`)}`],
          [t('account.login'), user.login],
          [t('account.device'), t('account.deviceValue', { code: deviceCode(device.no) })],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-[var(--text-muted)]">{label}</dt><dd className="font-medium text-right truncate">{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{syncLabel(t, sync)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {sync.pending ? t('sync.pending', { count: sync.pending }) : t('sync.allSent')}
              {' · '}
              {sync.lastSyncAt ? t('sync.last', { time: `${fmtDate(sync.lastSyncAt, { day: 'numeric', month: 'short' })} ${fmtTime(sync.lastSyncAt)}` }) : t('sync.never')}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => syncNow()} disabled={sync.status === 'syncing' || sync.status === 'auth'}>{t('sync.now')}</button>
        </div>
        {sync.status === 'auth' && <p role="alert" className="text-sm text-[var(--warning)] mt-3">{t('sync.authBody')}</p>}
        {sync.status === 'error' && sync.error && <p role="alert" className="text-sm text-[var(--danger)] mt-3">{sync.error}</p>}
        {sync.rejected.length > 0 && (
          <div className="storage-notice mt-4 !mb-0" role="alert">
            <div className="flex-1">
              <p className="font-semibold">{t('sync.rejectedTitle', { count: sync.rejected.length })}</p>
              <p className="mt-1">{t('sync.rejectedBody')}</p>
              <p className="text-xs font-mono text-[var(--text-muted)] mt-2 break-words">{sync.rejected.slice(0, 3).map((r) => `${r.type}: ${r.reason}`).join(' · ')}</p>
              <div className="flex gap-2 mt-3">
                <button className="btn btn-secondary btn-sm" onClick={retryRejected}>{t('sync.retry')}</button>
                <button className="btn btn-secondary btn-sm" onClick={discardRejected}>{t('sync.dismiss')}</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {sync.status === 'auth' && (cloud ? <CloudSignIn intro={false} /> : <SignInForm />)}
      {user.role === 'owner' && sync.status !== 'auth' && (cloud ? <CloudTeam /> : <Team />)}
      {sync.status !== 'auth' && (cloud ? <CloudPassword /> : <ChangePassword />)}

      <button className="btn btn-sm text-[var(--danger)]" onClick={leave}>{t('account.signOut')}</button>
    </div>
  );
}

/* ── the window ───────────────────────────────────────────────── */

/** Shown once after creating an account or resetting a password. It cannot be dismissed by accident. */
function RecoveryCode({ code, onDone }) {
  const { t } = useTranslation();
  const [noted, setNoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* writing it down still works */ }
  };
  return (
    <Modal open onClose={() => {}} title={t('account.recoveryTitle')}
      footer={<button className="btn btn-cta" disabled={!noted} onClick={onDone}>{t('account.done')}</button>}>
      <p className="text-[var(--text-secondary)] -mt-2 mb-5 leading-relaxed">{t('account.recoveryBody')}</p>
      <div className="card-inset p-5 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xl font-semibold tracking-wider select-all">{code}</span>
        <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? t('account.copied') : t('account.copy')}</button>
      </div>
      <label className="choice-row mt-5">
        <input type="checkbox" checked={noted} onChange={(e) => setNoted(e.target.checked)} />
        <span className="font-medium">{t('account.recoveryAck')}</span>
      </label>
    </Modal>
  );
}

export default function AccountModal({ open, onClose }) {
  const { t } = useTranslation();
  const { mode, cloud, pendingShop } = useAccount();
  const [recoveryCode, setRecoveryCode] = useState(null);

  if (recoveryCode) return <RecoveryCode code={recoveryCode} onDone={() => { setRecoveryCode(null); onClose(); }} />;
  if (!open) return null;
  const title = mode === 'account' ? t('account.title') : pendingShop ? t('account.cloud.createTitle') : t('account.localTitle');
  let body;
  if (mode === 'account') body = <SignedIn />;
  else if (!cloud) body = <SignedOut onRecoveryCode={setRecoveryCode} />;
  else body = pendingShop ? <CreateShop /> : <CloudSignIn />;
  return (
    <Modal open onClose={onClose} title={title} width={560}>
      {body}
    </Modal>
  );
}
