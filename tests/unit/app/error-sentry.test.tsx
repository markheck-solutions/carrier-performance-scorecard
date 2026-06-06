import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const sentryClientMocks = vi.hoisted(() => ({
  captureClientError: vi.fn(),
}));

vi.mock("@/lib/observability/sentry-client", () => ({
  captureClientError: sentryClientMocks.captureClientError,
}));

import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sentry error boundaries", () => {
  it("captures segment errors without rendering internals", () => {
    const unstable_retry = vi.fn();
    const error = Object.assign(new Error("SQL: select secret"), { digest: "digest-123" });

    render(<ErrorPage error={error} unstable_retry={unstable_retry} />);

    expect(sentryClientMocks.captureClientError).toHaveBeenCalledWith(error, {
      operation: "app-error-boundary",
      route: "/",
      context: { digest: "digest-123" },
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByText(/SQL: select secret/i)).not.toBeInTheDocument();
  });

  it("captures root layout errors with digest context", () => {
    const unstable_retry = vi.fn();
    const error = Object.assign(new Error("Layout failure"), { digest: "root-digest" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(<GlobalError error={error} unstable_retry={unstable_retry} />);
    } finally {
      consoleError.mockRestore();
    }

    expect(sentryClientMocks.captureClientError).toHaveBeenCalledWith(error, {
      operation: "app-global-error-boundary",
      route: "/",
      context: { digest: "root-digest" },
    });
    expect(screen.queryByText(/Layout failure/i)).not.toBeInTheDocument();
  });
});
