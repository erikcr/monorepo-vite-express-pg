import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmailJob } from "../jobs/registry.js";
import { EmailError, html, sendEmail, tagValue } from "../lib/email.js";
import { logger } from "../logger.js";

const email = { to: "ann@x.test", subject: "Hello", text: "Hi Ann" };

/** Stubs Resend's API: answers `status` with `body`, and records each request. */
function stubResend(status = 200, body: object = { id: "em_1" }) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  return {
    fetch,
    request: (n = 0) => {
      const [url, init] = fetch.mock.calls[n] ?? [];
      return {
        url,
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("html", () => {
  it("escapes what it inserts, links included", () => {
    const url = "https://app.test/r?a=1&b=2";
    expect(String(html`<a href="${url}">${'<b>"Tom" & Jerry\'s</b>'}</a>`)).toBe(
      '<a href="https://app.test/r?a=1&amp;b=2">&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;</a>'
    );
  });

  it("inserts nested html and arrays as is, and nothing for null, undefined or false", () => {
    const items = ["a&b", "c"].map((x) => html`<li>${x}</li>`);
    expect(String(html`<ul>${items}</ul>${null}${undefined}${false}${0}`)).toBe(
      "<ul><li>a&amp;b</li><li>c</li></ul>0"
    );
  });
});

describe("sendEmail", () => {
  it("posts to Resend with the sender, a one-line subject and the environment tag", async () => {
    const resend = stubResend();
    vi.stubEnv("EMAIL_FROM", "App <hello@app.test>");
    const id = await sendEmail(
      {
        ...email,
        // A browser error message with a line break, as error alerts copy them.
        subject: "New error: Loading chunk 26 failed.\n(error: https://x.test/a.js)",
        html: "<p>Hi</p>",
        tags: { kind: "alert.new error" },
      },
      { idempotencyKey: "send-email/1" }
    );
    expect(id).toBe("em_1");
    const { url, headers, body } = resend.request();
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers).toMatchObject({
      authorization: "Bearer re_test",
      "idempotency-key": "send-email/1",
    });
    expect(body).toEqual({
      from: "App <hello@app.test>",
      to: "ann@x.test",
      subject: "New error: Loading chunk 26 failed. (error: https://x.test/a.js)",
      text: "Hi Ann",
      html: "<p>Hi</p>",
      tags: [
        { name: "kind", value: "alert_new_error" },
        { name: "environment", value: "test" },
      ],
    });
  });

  it("throws Resend's reason when it refuses the email, without the address", async () => {
    stubResend(403, { name: "validation_error", message: "The app.test domain is not verified" });
    const sent = sendEmail(email);
    await expect(sent).rejects.toThrow(EmailError);
    await expect(sent).rejects.toThrow(
      "Resend refused the email (403 validation_error): The app.test domain is not verified"
    );
    await expect(sent).rejects.not.toThrow("ann@x.test");
  });

  it("throws when Resend answers with something other than JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("Bad gateway", { status: 502 }));
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await expect(sendEmail(email)).rejects.toThrow("Resend refused the email (502 unknown)");
  });

  it("only logs the email without RESEND_API_KEY: all of it locally, the subject when deployed", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(await sendEmail(email)).toBeNull();
    expect(warn).toHaveBeenLastCalledWith({ email }, "email not sent: RESEND_API_KEY is not set");
    vi.stubEnv("NODE_ENV", "production");
    await sendEmail(email);
    expect(warn).toHaveBeenLastCalledWith(
      { email: { subject: "Hello" } },
      "email not sent: RESEND_API_KEY is not set"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("send-email job", () => {
  it("sends with a key from the job id, so a retry of the same job never sends twice", async () => {
    const resend = stubResend();
    await sendEmailJob.handler(email, { db: undefined as never, jobId: "job-1" });
    await sendEmailJob.handler(email, { db: undefined as never, jobId: "job-1" });
    expect(resend.request(0).headers["idempotency-key"]).toBe("send-email/job-1");
    expect(resend.request(1).headers["idempotency-key"]).toBe("send-email/job-1");
  });

  it("fails when Resend refuses the email, so pg-boss retries it", async () => {
    stubResend(429, { name: "rate_limit_exceeded", message: "Too many requests" });
    await expect(
      sendEmailJob.handler(email, { db: undefined as never, jobId: "j" })
    ).rejects.toThrow(EmailError);
  });
});

describe("tagValue", () => {
  it("reads a tag sent as a list or returned as an object", () => {
    expect(tagValue([{ name: "kind", value: "invite" }], "kind")).toBe("invite");
    expect(tagValue({ kind: "invite" }, "kind")).toBe("invite");
    expect(tagValue({ kind: 1 }, "kind")).toBeUndefined();
    expect(tagValue(undefined, "kind")).toBeUndefined();
  });
});
