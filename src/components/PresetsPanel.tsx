"use client";

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/store';
import type { SavedPreset } from '@/store';
import type { ChannelConfig, GlobalConfig } from '@/types/sonification';
import { useSession } from 'next-auth/react';

interface CommunityPreset {
  slug: string;
  name: string;
  userId: string;
  username: string | null;
  userName: string | null;
  userImage: string | null;
  createdAt: string;
}

function defaultPresetName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PresetsPanel() {
  const { data: session } = useSession();
  const savedPresets = useStore((s) => s.savedPresets);
  const savePreset = useStore((s) => s.savePreset);
  const loadPreset = useStore((s) => s.loadPreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const updateGlobal = useStore((s) => s.updateGlobal);

  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [communityPresets, setCommunityPresets] = useState<CommunityPreset[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  // Load username on mount (only if signed in)
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/user/profile').then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        setUsername(data.username ?? null);
      }
    }).catch(() => {});
  }, [session?.user]);

  // Auto-fetch community on mount
  const fetchCommunity = useCallback(async () => {
    setLoadingCommunity(true);
    try {
      const res = await fetch('/api/presets');
      if (res.ok) setCommunityPresets(await res.json());
    } finally {
      setLoadingCommunity(false);
    }
  }, []);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  const handleSave = () => {
    const name = saveName.trim() || defaultPresetName();
    savePreset(name);
    setSaveName('');
    setShowSave(false);
  };

  const handleSaveAndShare = async () => {
    const name = saveName.trim() || defaultPresetName();
    savePreset(name);
    setSaveName('');
    setShowSave(false);
    // Share immediately
    const state = useStore.getState();
    setSharing(name);
    setShareResult(null);
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, global: state.global, channels: state.channels }),
      });
      if (!res.ok) {
        const err = await res.json();
        setShareResult(err.error || 'Failed to share');
      } else {
        const { slug } = await res.json();
        const url = `${window.location.origin}/?preset=${slug}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setShareResult(url);
        fetchCommunity();
      }
    } catch {
      setShareResult('Network error');
    } finally {
      setSharing(null);
    }
  };

  const handleShare = async (preset: SavedPreset) => {
    setSharing(preset.name);
    setShareResult(null);
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset.name, global: preset.global, channels: preset.channels }),
      });
      if (!res.ok) {
        const err = await res.json();
        setShareResult(err.error || 'Failed to share');
      } else {
        const { slug } = await res.json();
        const url = `${window.location.origin}/?preset=${slug}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setShareResult(url);
        fetchCommunity();
      }
    } catch {
      setShareResult('Network error');
    } finally {
      setSharing(null);
    }
  };

  const saveUsername = async () => {
    const val = usernameInput.trim().toLowerCase();
    if (!val) return;
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val }),
    });
    if (res.ok) {
      setUsername(val);
      setEditingUsername(false);
    }
  };

  const loadCommunityPreset = async (slug: string) => {
    const res = await fetch(`/api/presets/${slug}`);
    if (!res.ok) return;
    const data = await res.json();
    const g = data.globalConfig as GlobalConfig;
    const ch = data.channelsConfig as Record<string, ChannelConfig>;
    if (g) updateGlobal(g);
    for (const [id, config] of Object.entries(ch)) {
      useStore.getState().updateChannel(id, config);
    }
  };

  const handleUnshare = async (slug: string) => {
    const res = await fetch(`/api/presets?slug=${slug}`, { method: 'DELETE' });
    if (res.ok) fetchCommunity();
  };

  const isSignedIn = !!session?.user;
  const myUserId = session?.user?.id;

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div
          style={{
            fontFamily: 'var(--font-display, var(--ff-display))',
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(245, 240, 235, 0.75)',
            letterSpacing: '0.03em',
          }}
        >
          Settings
        </div>
        <div className="flex gap-1.5">
          {isSignedIn && (
            <button
              onClick={() => setShowSave(!showSave)}
              className="text-[9px] px-2.5 py-1 rounded transition-colors"
              style={{
                background: showSave ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                color: showSave ? 'var(--text-primary)' : 'rgba(245,240,235,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {showSave ? 'cancel' : 'save current'}
            </button>
          )}
        </div>
      </div>

      {/* Save form */}
      {showSave && (
        <div className="flex gap-1.5 mb-3">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveAndShare()}
            placeholder={defaultPresetName()}
            autoFocus
            className="flex-1 text-[10px] rounded px-2 py-1 outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <button
            onClick={handleSave}
            className="text-[9px] px-2.5 py-1 rounded"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(245,240,235,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            save privately
          </button>
          <button
            onClick={handleSaveAndShare}
            className="text-[9px] px-2.5 py-1 rounded"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            save + share
          </button>
        </div>
      )}

      {/* Share result */}
      {shareResult && (
        <div className="mb-2 p-1.5 rounded text-[9px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(245,240,235,0.5)' }}>
          {shareResult.startsWith('http') ? (
            <>link copied: <span style={{ color: 'var(--text-primary)' }}>{shareResult.split('?preset=')[1]}</span></>
          ) : (
            shareResult
          )}
        </div>
      )}

      {/* My saved presets */}
      {savedPresets.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] mb-1" style={{ color: 'rgba(245,240,235,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            My Presets
          </div>
          <div className="space-y-0.5">
            {[...savedPresets].reverse().map((preset) => (
              <div
                key={preset.name}
                className="flex items-center gap-1.5 rounded px-2 py-1 group cursor-pointer transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)' }}
                onClick={() => loadPreset(preset.name)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              >
                <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {preset.name}
                </span>
                <span className="text-[8px]" style={{ color: 'rgba(245,240,235,0.2)' }}>
                  {new Date(preset.savedAt).toLocaleDateString()}
                </span>
                {isSignedIn && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleShare(preset); }}
                    className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    style={{ color: 'rgba(245,240,235,0.35)' }}
                    title="Share to community"
                  >
                    {sharing === preset.name ? '...' : 'share'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deletePreset(preset.name); }}
                  className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity px-1"
                  style={{ color: 'rgba(245,240,235,0.3)' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Community */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9px]" style={{ color: 'rgba(245,240,235,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Community
          </div>
          <button
            onClick={fetchCommunity}
            className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
            style={{ color: 'rgba(245,240,235,0.3)', background: 'rgba(255,255,255,0.04)' }}
          >
            {loadingCommunity ? '...' : 'refresh'}
          </button>
        </div>
        {communityPresets.length > 0 ? (
          <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
            {communityPresets.map((p) => (
              <div
                key={p.slug}
                className="flex items-center gap-1.5 rounded px-2 py-1 group cursor-pointer transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)' }}
                onClick={() => loadCommunityPreset(p.slug)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              >
                <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {p.name}
                </span>
                <span className="text-[8px] truncate" style={{ color: 'rgba(245,240,235,0.25)', maxWidth: 80 }}>
                  {p.username || 'anon'}
                </span>
                {myUserId && p.userId === myUserId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUnshare(p.slug); }}
                    className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    style={{ color: 'rgba(248, 140, 140, 0.5)' }}
                    title="Unshare"
                  >
                    unshare
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[9px]" style={{ color: 'rgba(245,240,235,0.15)' }}>
            {loadingCommunity ? 'loading...' : 'no shared presets yet — be the first'}
          </div>
        )}
      </div>

      {/* Username */}
      {isSignedIn && (
        <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-baseline gap-2">
            <div className="text-[10px] shrink-0" style={{ color: 'rgba(245,240,235,0.35)' }}>username</div>
            {editingUsername ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
                  autoFocus
                  className="flex-1 text-[11px] rounded px-2 py-1 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="lowercase, 2-30 chars"
                />
                <button onClick={saveUsername} className="text-[10px] px-1.5" style={{ color: 'var(--accent)' }}>ok</button>
                <button onClick={() => setEditingUsername(false)} className="text-[10px] px-1" style={{ color: 'rgba(245,240,235,0.3)' }}>x</button>
              </div>
            ) : (
              <>
                <span className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>{username || '—'}</span>
                <button
                  onClick={() => { setUsernameInput(username || ''); setEditingUsername(true); }}
                  className="text-[10px] px-1"
                  style={{ color: 'rgba(245,240,235,0.3)' }}
                >
                  edit
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
