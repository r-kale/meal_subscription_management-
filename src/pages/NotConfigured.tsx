export function NotConfigured(props: { onTryDemo: () => void }) {
  return (
    <div className="center-screen" data-testid="not-configured">
      <div className="logo">🍱</div>
      <h1>Tiffin Manager</h1>
      <p>
        This app is not connected to a database yet. Follow the steps in{' '}
        <a href="https://github.com/r-kale/meal_subscription_management-/blob/main/docs/SETUP.md" target="_blank" rel="noreferrer">
          docs/SETUP.md
        </a>{' '}
        to create a free Supabase project and paste its URL and key into <code>public/config.js</code>.
      </p>
      <p>Or explore with sample data first — nothing leaves this device.</p>
      <button className="btn primary" onClick={props.onTryDemo} data-testid="try-demo">
        Try Demo Mode
      </button>
    </div>
  )
}
