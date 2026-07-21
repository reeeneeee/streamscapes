'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

export default function AuthButton({ className = '' }: { className?: string }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (status === 'loading') return null;

  if (!session) {
    return (
      <div ref={ref} style={{ position: 'relative' }} className={className}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(245, 240, 235, 0.3)',
            fontFamily: 'var(--font-body, var(--ff-body))',
            fontSize: 12,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          sign in
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              background: 'rgba(20, 20, 22, 0.95)',
              border: '1px solid rgba(245, 240, 235, 0.1)',
              borderRadius: 8,
              padding: '8px',
              minWidth: 160,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {[
              { id: 'apple', label: 'Apple' },
              { id: 'google', label: 'Google' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => signIn(p.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(245, 240, 235, 0.5)',
                  fontFamily: 'var(--font-body, var(--ff-body))',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '6px 8px',
                  textAlign: 'left',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245, 240, 235, 0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const initial = (session.user?.name?.[0] ?? session.user?.email?.[0] ?? '?').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }} className={className}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: session.user?.image ? 'none' : '1px solid rgba(245, 240, 235, 0.2)',
          background: session.user?.image ? 'none' : 'rgba(245, 240, 235, 0.08)',
          color: 'rgba(245, 240, 235, 0.6)',
          fontFamily: 'var(--font-body, var(--ff-body))',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {session.user?.image ? (
          <img src={session.user.image} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
        ) : initial}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            background: 'rgba(20, 20, 22, 0.95)',
            border: '1px solid rgba(245, 240, 235, 0.1)',
            borderRadius: 8,
            padding: '12px 16px',
            minWidth: 180,
            zIndex: 100,
          }}
        >
          <div style={{ color: 'rgba(245, 240, 235, 0.5)', fontSize: 12, marginBottom: 8 }}>
            {session.user?.email}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(245, 240, 235, 0.3)',
              fontFamily: 'var(--font-body, var(--ff-body))',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            sign out
          </button>
        </div>
      )}
    </div>
  );
}
