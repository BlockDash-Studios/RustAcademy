"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { NetworkBadge } from "@/components/NetworkBadge";
import { QRPreview } from "@/components/QRPreview";
import { useFocusPreview } from "@/hooks/useFocusPreview";

type Profile = {
  username: string;
  publicKey: string;
  primaryColor?: string;
  avatarUrl?: string;
  bio?: string;
  twitterHandle?: string;
  discordHandle?: string;
  githubHandle?: string;
};

type PaymentFormState = {
  amount: string;
  asset: string;
  memo: string;
};

type PaymentErrors = Partial<Record<keyof PaymentFormState, string>>;

function getContrastingTextColor(hexColor: string) {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#ffffff";
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.68 ? "#111827" : "#ffffff";
}

export default function PublicProfile() {
  useFocusPreview();

  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const error = null;

  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    amount: "",
    asset: "USDC",
    memo: "",
  });
  const [paymentErrors, setPaymentErrors] = useState<PaymentErrors>({});
  const [generatedRequest, setGeneratedRequest] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfile({
        username,
        publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        primaryColor: "#6366f1",
        avatarUrl: "",
        bio: "Building the future of payments on Stellar",
        twitterHandle: "stellarorg",
        discordHandle: "quickex-community",
        githubHandle: "stellar",
      });
      setLoading(false);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [username]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const primaryColor = profile?.primaryColor || "#6366f1";
  const buttonTextColor = useMemo(
    () => getContrastingTextColor(primaryColor),
    [primaryColor],
  );

  const socialLinks = useMemo(() => {
    if (!profile) {
      return [] as Array<{
        id: string;
        label: string;
        href: string;
        text: string;
      }>;
    }

    const links: Array<{
      id: string;
      label: string;
      href: string;
      text: string;
    }> = [];

    if (profile.twitterHandle) {
      links.push({
        id: "twitter",
        label: `Open Twitter profile for @${profile.twitterHandle}`,
        href: `https://twitter.com/${profile.twitterHandle}`,
        text: "X",
      });
    }

    if (profile.githubHandle) {
      links.push({
        id: "github",
        label: `Open GitHub profile for ${profile.githubHandle}`,
        href: `https://github.com/${profile.githubHandle}`,
        text: "GH",
      });
    }

    return links;
  }, [profile]);

  const validatePayment = () => {
    const nextErrors: PaymentErrors = {};

    if (!paymentForm.amount) {
      nextErrors.amount = "Amount is required.";
    } else if (Number(paymentForm.amount) <= 0 || Number.isNaN(Number(paymentForm.amount))) {
      nextErrors.amount = "Enter an amount greater than zero.";
    }

    if (paymentForm.memo.length > 28) {
      nextErrors.memo = "Memo must be 28 characters or fewer.";
    }

    return nextErrors;
  };

  const handleGenerateRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validatePayment();
    setPaymentErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !profile) {
      return;
    }

    const request = JSON.stringify({
      destination: profile.publicKey,
      amount: paymentForm.amount,
      asset: paymentForm.asset,
      memo: paymentForm.memo,
    });

    setGeneratedRequest(request);
    setStatusMessage("Payment request ready to share.");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-black">404</h1>
          <p className="text-neutral-300">Username not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white">
      <NetworkBadge />

      <div
        className="fixed left-[-30%] top-[-20%] h-[60%] w-[60%] rounded-full opacity-10 blur-[120px]"
        style={{ backgroundColor: primaryColor }}
      />
      <div
        className="fixed bottom-[-20%] right-[-30%] h-[50%] w-[50%] rounded-full opacity-5 blur-[100px]"
        style={{ backgroundColor: primaryColor }}
      />

      <main className="relative z-10 mx-auto max-w-2xl p-4 sm:p-6 md:p-12">
        <section className="mb-12 text-center">
          <div className="mb-6 flex justify-center">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${profile.username} avatar`}
                className="h-32 w-32 rounded-full border-4 object-cover"
                style={{ borderColor: primaryColor }}
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-32 w-32 items-center justify-center rounded-full border-4 text-5xl font-black"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                {profile.username[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="mb-3 text-4xl font-black">@{profile.username}</h1>

          {profile.bio && (
            <p className="mx-auto mb-6 max-w-md text-lg text-neutral-200">
              {profile.bio}
            </p>
          )}

          {(socialLinks.length > 0 || profile.discordHandle) && (
            <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
              {socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={link.label}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-xl transition hover:bg-white/10"
                  style={{ color: primaryColor }}
                >
                  {link.text}
                </a>
              ))}

              {profile.discordHandle && (
                <div
                  aria-label={`Discord handle: ${profile.discordHandle}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-neutral-100"
                >
                  Discord: {profile.discordHandle}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-3xl border border-white/5 bg-black/40 p-8 backdrop-blur-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-black">Send Payment</h2>
            <p className="mt-2 text-sm text-neutral-200">
              Complete the form and submit it to generate a shareable payment
              request for @{profile.username}.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleGenerateRequest} noValidate>
            <div>
              <label
                htmlFor="public-payment-amount"
                className="mb-2 block text-sm font-bold text-neutral-100"
              >
                Amount
              </label>
              <input
                id="public-payment-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={paymentForm.amount}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                aria-invalid={Boolean(paymentErrors.amount)}
                aria-describedby={
                  paymentErrors.amount
                    ? "public-payment-amount-help public-payment-amount-error"
                    : "public-payment-amount-help"
                }
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg text-white placeholder:text-neutral-400"
                placeholder="0.00"
              />
              <p
                id="public-payment-amount-help"
                className="mt-2 text-xs text-neutral-300"
              >
                Enter the amount the recipient should receive.
              </p>
              {paymentErrors.amount && (
                <p
                  id="public-payment-amount-error"
                  className="mt-2 text-xs text-red-300"
                >
                  {paymentErrors.amount}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="public-payment-asset"
                className="mb-2 block text-sm font-bold text-neutral-100"
              >
                Asset
              </label>
              <select
                id="public-payment-asset"
                value={paymentForm.asset}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    asset: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
                <option value="AQUA">AQUA</option>
                <option value="yXLM">yXLM</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="public-payment-memo"
                className="mb-2 block text-sm font-bold text-neutral-100"
              >
                Memo (optional)
              </label>
              <input
                id="public-payment-memo"
                type="text"
                maxLength={28}
                value={paymentForm.memo}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    memo: event.target.value,
                  }))
                }
                aria-invalid={Boolean(paymentErrors.memo)}
                aria-describedby={
                  paymentErrors.memo
                    ? "public-payment-memo-help public-payment-memo-error"
                    : "public-payment-memo-help"
                }
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-neutral-400"
                placeholder="Payment for..."
              />
              <p
                id="public-payment-memo-help"
                className="mt-2 text-xs text-neutral-300"
              >
                Keep the memo concise so it fits within Stellar memo limits.
              </p>
              {paymentErrors.memo && (
                <p
                  id="public-payment-memo-error"
                  className="mt-2 text-xs text-red-300"
                >
                  {paymentErrors.memo}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded-xl py-4 font-bold transition hover:opacity-90"
              style={{ backgroundColor: primaryColor, color: buttonTextColor }}
            >
              Generate Payment Link
            </button>
          </form>

          <p aria-live="polite" className="mt-4 text-sm text-neutral-200">
            {statusMessage ?? "Use Enter or the button above to generate the request."}
          </p>
        </section>

        {generatedRequest && (
          <section className="rounded-3xl border border-white/5 bg-black/40 p-8 backdrop-blur-2xl">
            <h2 className="mb-4 text-xl font-bold">Payment Request Ready</h2>
            <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
              <div>
                <QRPreview value={generatedRequest} />
              </div>

              <div className="space-y-4">
                <p className="text-sm text-neutral-200">
                  The QR code matches the details below, so people using screen
                  readers still have a text alternative for the request.
                </p>

                <dl className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                  <div>
                    <dt className="text-xs font-black uppercase tracking-widest text-neutral-300">
                      Destination
                    </dt>
                    <dd className="mt-1 font-mono text-neutral-100">
                      {profile.publicKey}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-widest text-neutral-300">
                      Amount
                    </dt>
                    <dd className="mt-1 text-neutral-100">
                      {paymentForm.amount} {paymentForm.asset}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-widest text-neutral-300">
                      Memo
                    </dt>
                    <dd className="mt-1 text-neutral-100">
                      {paymentForm.memo || "No memo added"}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-neutral-300">
                    Encoded payload
                  </p>
                  <p className="break-all font-mono text-xs text-neutral-100">
                    {generatedRequest}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mt-12 text-center text-sm text-neutral-300">
          <p>Powered by QuickEx - Stellar Network</p>
        </div>
      </main>
    </div>
  );
}
