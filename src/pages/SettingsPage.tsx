import React, { useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  BusinessSize,
  BusinessType,
  CurrencyCode,
  DashboardPreference,
  TeamMember,
} from '../types/financial';
import { Modal } from '../components/common/Modal';

export function SettingsPage({ initialTab = 'profile' }: { initialTab?: 'profile' | 'team' }) {
  const {
    activeBusiness,
    updateBusinessProfile,
    businessTeam,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    theme,
    setTheme,
    setOnboardingOpen,
    resetDemoData,
    isBackendMode,
    showToast,
  } = useApp();

  const [tab, setTab] = useState<'profile' | 'preferences' | 'team'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Business profile editable state synced to activeBusiness
  const [name, setName] = useState(activeBusiness.name);
  const [type, setType] = useState<BusinessType>(activeBusiness.type);
  const [industry, setIndustry] = useState(activeBusiness.industry);
  const [currency, setCurrency] = useState<CurrencyCode>(activeBusiness.currency);
  const [country, setCountry] = useState(activeBusiness.country);
  const [size, setSize] = useState<BusinessSize>(activeBusiness.size);
  const [fyStart, setFyStart] = useState(activeBusiness.financialYearStart);
  const [dashPref, setDashPref] = useState<DashboardPreference>(
    activeBusiness.dashboardPreference
  );

  useEffect(() => {
    setName(activeBusiness.name);
    setType(activeBusiness.type);
    setIndustry(activeBusiness.industry);
    setCurrency(activeBusiness.currency);
    setCountry(activeBusiness.country);
    setSize(activeBusiness.size);
    setFyStart(activeBusiness.financialYearStart);
    setDashPref(activeBusiness.dashboardPreference);
  }, [activeBusiness]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('Accountant');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateBusinessProfile({
      name: name.trim() || activeBusiness.name,
      type,
      industry: industry.trim() || activeBusiness.industry,
      currency,
      country,
      size,
      financialYearStart: fyStart,
      dashboardPreference: dashPref,
    }).catch((err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Unable to save settings.', 'warning');
    });
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    inviteTeamMember({
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
    }).catch((err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Unable to invite member.', 'warning');
    });
    setInviteName('');
    setInviteEmail('');
    setInviteOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {activeBusiness.name} Configuration{' '}
            <span className="ml-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
              ({isBackendMode ? 'Cloud PostgreSQL Workspace' : 'Illustrative Demo Workspace'})
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage business entity profile, currency defaults, workspace theme, and team permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Business
          </button>
          <button
            type="button"
            onClick={resetDemoData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/30 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`px-3.5 py-1.5 rounded-md font-medium ${
            tab === 'profile'
              ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Business Profile
        </button>
        <button
          type="button"
          onClick={() => setTab('preferences')}
          className={`px-3.5 py-1.5 rounded-md font-medium ${
            tab === 'preferences'
              ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Currency & Preferences
        </button>
        <button
          type="button"
          onClick={() => setTab('team')}
          className={`px-3.5 py-1.5 rounded-md font-medium ${
            tab === 'team'
              ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Team & Access ({businessTeam.length})
        </button>
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl p-6 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 max-w-3xl space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Business Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Business Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BusinessType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                {[
                  'Retail',
                  'Grocery',
                  'Restaurant',
                  'Startup',
                  'Freelancer',
                  'Service Business',
                  'Home Business',
                  'Other',
                ].map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Business Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as BusinessSize)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                {[
                  'Solo / Micro (1–5)',
                  'Small (6–20)',
                  'Growing (21–50)',
                  'Mid-Size (51–200)',
                ].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Financial Year Start</label>
              <select
                value={fyStart}
                onChange={(e) => setFyStart(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                {['April (India FY)', 'January (Calendar)', 'July', 'October'].map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              Save Business Profile
            </button>
          </div>
        </form>
      )}

      {tab === 'preferences' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl p-6 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 max-w-3xl space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Display Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                <option value="INR">INR (₹) — Indian Rupee</option>
                <option value="USD">USD ($) — US Dollar</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Dashboard Configuration
              </label>
              <select
                value={dashPref}
                onChange={(e) => setDashPref(e.target.value as DashboardPreference)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                <option value="Executive Balanced">Executive Balanced</option>
                <option value="Cash Flow First">Cash Flow First</option>
                <option value="Profitability & Margins">Profitability & Margins</option>
                <option value="Inventory & Operations">Inventory & Operations</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2">Interface Theme</label>
            <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3.5 py-1.5 rounded-md font-medium ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                Midnight Stone
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3.5 py-1.5 rounded-md font-medium ${
                  theme === 'light'
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                Warm Ivory
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              Save Preferences
            </button>
          </div>
        </form>
      )}

      {tab === 'team' && (
        <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/8">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Team & Access Control
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Assign role-based permissions for finance managers, external accountants, and operations staff.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite Member
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">Member</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Last Active</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                {businessTeam.map((member) => (
                  <tr key={member.id}>
                    <td className="py-3 px-5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {member.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {member.email}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={member.role}
                        disabled={member.role === 'Owner'}
                        onChange={(e) =>
                          updateTeamMemberRole(
                            member.id,
                            e.target.value as TeamMember['role']
                          )
                        }
                        aria-label={`Role for ${member.name}`}
                        className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#20303d] disabled:opacity-60"
                      >
                        <option value="Owner">Owner</option>
                        <option value="Finance Manager">Finance Manager</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Operations">Operations</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          member.status === 'Active'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400 font-medium'
                        }
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500 dark:text-slate-400">
                      {member.lastActive}
                    </td>
                    <td className="py-3 px-5 text-right">
                      {member.role !== 'Owner' && (
                        <button
                          type="button"
                          onClick={() => removeTeamMember(member.id)}
                          aria-label={`Remove ${member.name}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Team Member"
        subtitle={`Grant workspace access to ${activeBusiness.name}`}
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g., Siddharth Menon"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Work Email *</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="siddharth@company.in"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Access Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMember['role'])}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
            >
              <option value="Finance Manager">Finance Manager</option>
              <option value="Accountant">Accountant</option>
              <option value="Operations">Operations</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/8">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
            >
              Send Invite
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
