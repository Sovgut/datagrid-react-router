import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Testing Library only registers its own `afterEach(cleanup)` when Vitest runs
 * with `globals: true`. This suite runs with explicit imports instead, so the
 * unmount has to be wired up by hand, otherwise every render stays in the
 * document and queries start matching elements from earlier tests.
 */
afterEach(cleanup);
