import React, { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';

// Supabase error codes, and the sentence each becomes (account.err.*).
const AUTH_ERRORS = {
  invalid_credentials: 'invalid_credentials', email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_already_exists', email_exists: 'user_already_exists', weak_password: 'weak_password',
  otp_expired: 'otp_expired', phone_provider_disabled: 'sms_unavailable', sms_send_failed: 'sms_unavailable',
  provider_disabled: 'google_unavailable', over_email_send_rate_limit: 'rate_limit', over_sms_send_rate_limit: 'rate_limit',
  over_request_rate_limit: 'rate_limit', already_member: 'already_member', network: 'network', forbidden: 'forbidden',
  invalid_input: 'invalid_input', not_found: 'not_found',
};

/** A Supabase failure in the user's language; an unknown one keeps Supabase's own words. */
export function explainCloud(t, error) {
  let code = AUTH_ERRORS[error?.code];
  if (!code && /unsupported provider|provider is not enabled/i.test(error?.message || '')) code = 'google_unavailable';
  if (!code && /phone.*(disabled|provider)|sms/i.test(error?.message || '')) code = 'sms_unavailable';
  if (code) return t(`account.err.${code}`);
  return error?.message || t('account.err.generic');
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

/** Runs an action with a busy state and one error message in words. */
function useAction() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action) => {
    if (busy) return undefined;
    setError('');
    setBusy(true);
    try {
      return await action();
    } catch (failure) {
      setError(explainCloud(t, failure));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const GoogleMark = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/* ── signing in ─────────────────────────────────────────────────── */

function EmailForm({ onSignedIn }) {
  const { t } = useTranslation();
  const { auth } = useAccount();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, setError, run } = useAction();

  const submit = (event) => {
    event.preventDefault();
    setNote('');
    run(async () => {
      if (creating) {
        const { confirm } = await auth.signUpEmail(email, password);
        if (confirm) { setNote(t('account.cloud.checkEmail', { email: email.trim() })); return; }
      } else {
        await auth.signInEmail(email, password);
      }
      await onSignedIn();
    });
  };

  const forgot = () => {
    if (!email.trim()) { setError(t('account.cloud.enterEmail')); return; }
    run(async () => { await auth.resetPassword(email); setNote(t('account.cloud.resetSent', { email: email.trim() })); });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label={t('account.cloud.emailLabel')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label={t('account.password')} type="password" autoComplete={creating ? 'new-password' : 'current-password'} required minLength={6}
        value={password} onChange={(e) => setPassword(e.target.value)} hint={creating ? t('account.cloud.passwordHint') : undefined} />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      {note && <p role="status" className="text-sm text-[var(--success)]">{note}</p>}
      <button type="submit" className="btn btn-cta w-full" disabled={busy}>{busy ? t('account.working') : t(creating ? 'account.cloud.createBtn' : 'account.cloud.signInBtn')}</button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="text-btn -ml-2.5" onClick={() => { setCreating((v) => !v); setError(''); setNote(''); }}>
          {t(creating ? 'account.cloud.toSignIn' : 'account.cloud.toCreate')}
        </button>
        {!creating && <button type="button" className="text-btn -mr-2.5" onClick={forgot} disabled={busy}>{t('account.cloud.forgot')}</button>}
      </div>
    </form>
  );
}

function PhoneForm({ onSignedIn }) {
  const { t } = useTranslation();
  const { auth } = useAccount();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useAction();
  const digits = phone.replace(/\D/g, '').slice(-10);

  const send = (event) => {
    event.preventDefault();
    if (digits.length !== 10) { setError(t('account.err.invalid_login')); return; }
    run(async () => { await auth.sendPhoneCode(digits); setSent(true); });
  };
  const verify = (event) => {
    event.preventDefault();
    run(async () => { await auth.verifyPhoneCode(digits, code); await onSignedIn(); });
  };

  return sent ? (
    <form className="space-y-4" onSubmit={verify}>
      <p className="text-sm text-[var(--text-secondary)]">{t('account.cloud.codeSent', { phone: `+91 ${digits}` })}</p>
      <Field label={t('account.cloud.codeLabel')} inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-cta w-full" disabled={busy}>{busy ? t('account.working') : t('account.cloud.verify')}</button>
      <button type="button" className="text-btn -ml-2.5 text-sm" onClick={() => { setSent(false); setCode(''); setError(''); }}>{t('account.cloud.changeNumber')}</button>
    </form>
  ) : (
    <form className="space-y-4" onSubmit={send}>
      <Field label={t('account.cloud.phoneLabel')} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-cta w-full" disabled={busy}>{busy ? t('account.working') : t('account.cloud.sendCode')}</button>
    </form>
  );
}

/** Google, email + password, or phone + SMS code. `onDone` runs once the shop is open (or must be created). */
export function CloudSignIn({ intro = true }) {
  const { t } = useTranslation();
  const { auth, continueSignIn } = useAccount();
  const [tab, setTab] = useState('email');
  const google = useAction();

  return (
    <div>
      {intro && <p className="text-[var(--text-secondary)] -mt-2 mb-5 leading-relaxed">{t('account.cloud.intro')}</p>}
      <button type="button" className="btn btn-ghost w-full gap-3" onClick={() => google.run(() => auth.google())} disabled={google.busy}>
        <GoogleMark />{t('account.cloud.google')}
      </button>
      {google.error && <p role="alert" className="text-sm text-[var(--danger)] mt-2">{google.error}</p>}
      <div className="flex items-center gap-3 my-5 text-xs text-[var(--text-muted)]" aria-hidden="true">
        <span className="flex-1 h-px bg-[var(--border)]" />{t('account.cloud.or')}<span className="flex-1 h-px bg-[var(--border)]" />
      </div>
      <div className="segmented mb-5" role="tablist">
        {['email', 'phone'].map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t(`account.cloud.${key}`)}</button>
        ))}
      </div>
      {tab === 'email' ? <EmailForm onSignedIn={continueSignIn} /> : <PhoneForm onSignedIn={continueSignIn} />}
    </div>
  );
}

/** Signed in, but with no shop yet: the owner names it. */
export function CreateShop() {
  const { t } = useTranslation();
  const { createShop, cancelPending, pendingShop } = useAccount();
  const [shopName, setShopName] = useState('');
  const [name, setName] = useState('');
  const [keepDeviceData, setKeep] = useState(true);
  const { busy, error, run } = useAction();
  const who = pendingShop?.logins?.[0];

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => createShop({ shopName: shopName.trim(), name: name.trim(), keepDeviceData })); }}>
      <p className="text-[var(--text-secondary)] -mt-2 leading-relaxed">{t('account.cloud.createBody', { who: who || '' })}</p>
      <Field label={t('account.shopName')} required value={shopName} onChange={(e) => setShopName(e.target.value)} />
      <Field label={t('account.yourName')} required value={name} onChange={(e) => setName(e.target.value)} />
      <label className="choice-row">
        <input type="checkbox" checked={keepDeviceData} onChange={(e) => setKeep(e.target.checked)} />
        <span><span className="font-medium">{t('account.keepData')}</span><span className="block text-xs text-[var(--text-muted)]">{t('account.keepDataHint')}</span></span>
      </label>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-cta w-full" disabled={busy}>{busy ? t('account.working') : t('account.cloud.createShopBtn')}</button>
      <p className="text-sm text-[var(--text-muted)]">{t('account.cloud.staffHint')}</p>
      <button type="button" className="text-btn -ml-2.5 text-sm" onClick={cancelPending}>{t('account.cloud.otherAccount')}</button>
    </form>
  );
}

/* ── signed in ──────────────────────────────────────────────────── */

/** The owner adds staff by email or phone; they join when they sign in with it. */
export function CloudTeam() {
  const { t } = useTranslation();
  const { team } = useAccount();
  const { showToast } = useToast();
  const [members, setMembers] = useState(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const list = useAction();
  const add = useAction();

  const load = useCallback(() => list.run(async () => setMembers(await team.list())), [team]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const submit = (event) => {
    event.preventDefault();
    add.run(async () => {
      const member = await team.add({ login, name: name.trim() });
      setName(''); setLogin('');
      showToast(t('account.staffAdded', { name: member.name }), 'success');
      await load();
    });
  };
  const toggle = (m) => list.run(async () => { await team.update({ login: m.login, disabled: !m.disabled }); await load(); });

  return (
    <section>
      <h3 className="font-semibold">{t('account.team')}</h3>
      <p className="text-xs text-[var(--text-muted)] mt-1">{t('account.cloud.teamHint')}</p>
      {list.error && <p role="alert" className="text-sm text-[var(--danger)] mt-2">{list.error}</p>}
      {members && (
        <ul className="divide-y divide-[var(--border)] mt-3">
          {members.map((m) => (
            <li key={m.login} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{m.name}</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">
                  {m.login} · {t(`account.${m.role}`)} · {m.disabled ? t('account.disabled') : t(m.joined ? 'account.cloud.joined' : 'account.cloud.invited')}
                </span>
              </span>
              {m.role === 'staff' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggle(m)}>{t(m.disabled ? 'account.enable' : 'account.disable')}</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-3 mt-4 sm:grid-cols-[1fr_1fr_auto] items-end" onSubmit={submit}>
        <Field label={t('account.staffName')} required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('account.cloud.staffLogin')} required value={login} onChange={(e) => setLogin(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={add.busy}>{t('account.add')}</button>
      </form>
      {add.error && <p role="alert" className="text-sm text-[var(--danger)] mt-2">{add.error}</p>}
    </section>
  );
}

/** For email sign-ins: set a new password (also how a "forgot password" link is finished). */
export function CloudPassword() {
  const { t } = useTranslation();
  const { auth } = useAccount();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await auth.setPassword(password); setPassword(''); showToast(t('account.passwordChanged'), 'success'); }); }}>
      <h3 className="font-semibold">{t('account.changePassword')}</h3>
      <Field label={t('account.newPassword')} type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>{busy ? t('account.working') : t('account.cloud.setPassword')}</button>
    </form>
  );
}
