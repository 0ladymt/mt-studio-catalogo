import { describe, expect, it, vi } from "vitest";
import { SingleFlight } from "../src/auth/single-flight.js";

describe("concurrent authentication", () => {
  it("shares only identical in-flight operations", async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const operation = vi.fn(async () => pending);
    const flights = new SingleFlight<string>();
    const first = flights.run("same-credentials", operation);
    const second = flights.run("same-credentials", operation);
    const different = flights.run("different-password", async () => "different");
    release("authenticated");
    await expect(first).resolves.toBe("authenticated");
    await expect(second).resolves.toBe("authenticated");
    await expect(different).resolves.toBe("different");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
