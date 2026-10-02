export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return <main className="login-page"><a href={`${base}/`}>← AI Sales Workspace</a><section><span className="eyebrow">Operator access</span><h1>Open your workspace</h1><p>Review inquiries, qualify opportunities and follow the conversion event.</p><form method="post" action={`${base}/api/session`}><label>Demo workspace password<input name="password" type="password" autoComplete="current-password" required /></label>{params.error && <p role="alert">The password was not accepted. Please try again.</p>}<button className="primary-button">Sign in</button></form><small>The public walkthrough is available on the project page.</small></section></main>;
}
