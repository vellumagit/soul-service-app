"use client";

// The last resort: an error thrown by the ROOT LAYOUT itself.
//
// When this fires, the root layout never rendered — which means globals.css
// (imported there) never loaded and no CSS variable or Tailwind class exists.
// So every style here is inline and every colour is a literal copied from the
// light-theme palette in globals.css. A class name would silently do nothing.
//
// Next also requires this file to render its own <html> and <body>, because
// it replaces the root layout rather than nesting inside it.
//
// In practice this should never be seen. It exists so that if it ever is, it
// still looks like her app and not a browser stack trace.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: "#faf6f0",
          color: "#1a1411",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            width: "100%",
            textAlign: "center",
            background: "#fdf9f1",
            border: "1px solid #ead9c1",
            borderRadius: 10,
            padding: "2rem",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 500, margin: "0 0 .5rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: ".875rem",
              lineHeight: 1.6,
              color: "#564a42",
              margin: 0,
            }}
          >
            Nothing you did caused this, and nothing has been lost.
          </p>

          <div
            style={{
              width: "2.5rem",
              borderTop: "1px solid #ead9c1",
              margin: "1.25rem auto",
            }}
          />

          <h2 style={{ fontSize: "1rem", fontWeight: 500, margin: "0 0 .25rem" }}>
            Щось пішло не так
          </h2>
          <p
            style={{
              fontSize: ".875rem",
              lineHeight: 1.6,
              color: "#564a42",
              margin: "0 0 1.5rem",
            }}
          >
            Це не через вас, і нічого не втрачено.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 6,
              padding: ".55rem 1rem",
              fontSize: ".875rem",
              fontWeight: 500,
              color: "#fff",
              background: "#5a3f4f",
            }}
          >
            Try again · Спробувати ще раз
          </button>

          {error.digest && (
            <p
              style={{
                fontSize: ".6875rem",
                fontFamily: "ui-monospace, monospace",
                color: "#9a8e84",
                margin: "1.5rem 0 0",
              }}
            >
              ref {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
