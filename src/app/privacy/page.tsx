export const metadata = {
  title: 'Privacy Policy — streamscapes',
};

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '80px 24px',
      fontFamily: 'var(--font-body, system-ui, sans-serif)',
      color: '#e8e6e3',
      lineHeight: 1.7,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display, system-ui, sans-serif)',
        fontWeight: 300,
        fontSize: 32,
        marginBottom: 8,
        letterSpacing: '-0.02em',
      }}>
        privacy policy
      </h1>
      <p style={{ color: '#8a8a8e', fontSize: 14, marginBottom: 40 }}>
        Last updated: March 16, 2026
      </p>

      <Section title="What streamscapes collects">
        <p>
          The Streamscapes Chrome extension collects <strong>browser activity data</strong> that
          you explicitly choose to stream: tab switch events (including the domain of the active
          tab) and download events (file start, completion, failure). This data is sent to your
          authenticated Streamscapes session for real-time sonification.
        </p>
        <p>
          Your API key and preferences are stored locally in Chrome&apos;s sync storage and never
          leave your browser except to authenticate with the Streamscapes server.
        </p>
      </Section>

      <Section title="What streamscapes does not collect">
        <ul>
          <li>Page content, form data, or browsing history</li>
          <li>Passwords, financial information, or personal communications</li>
          <li>GPS location or precise geolocation</li>
          <li>Keystrokes, mouse movements, or screen content</li>
        </ul>
      </Section>

      <Section title="How data is used">
        <p>
          Browser activity data is used solely for real-time audio sonification within your
          Streamscapes session. Events are ephemeral — they are converted to sound and not stored
          in any database. No event history is persisted on the server.
        </p>
      </Section>

      <Section title="Third parties">
        <p>
          Streamscapes does not sell, transfer, or share your data with any third party. Data is
          transmitted only between the Chrome extension and the Streamscapes server you configure
          (by default, streamscapes.fm).
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          Browser events are processed in real-time and discarded immediately after sonification.
          No event data is stored on the server. Your API key and preferences are stored locally
          in your browser and can be cleared at any time by removing the extension.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Reach out at{' '}
          <a href="mailto:help@streamscapes.fm" style={{ color: '#C4889A' }}>
            help@streamscapes.fm
          </a>.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 18,
        fontWeight: 500,
        marginBottom: 12,
      }}>
        {title}
      </h2>
      <div style={{
        fontSize: 15,
        color: '#c0beb8',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {children}
      </div>
    </section>
  );
}
