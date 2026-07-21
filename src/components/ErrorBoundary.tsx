"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0d0d0d",
            color: "rgba(245, 240, 235, 0.6)",
            fontFamily: "system-ui, sans-serif",
            gap: 16,
          }}
        >
          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 72px)",
              fontWeight: 300,
              color: "rgba(245, 240, 235, 0.9)",
              letterSpacing: "-0.04em",
            }}
          >
            streamscapes
          </h1>
          <p style={{ fontSize: 14, maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
            Something went wrong loading the app. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "8px 20px",
              borderRadius: 8,
              background: "rgba(196, 136, 154, 0.2)",
              color: "rgba(245, 240, 235, 0.8)",
              border: "1px solid rgba(196, 136, 154, 0.3)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
