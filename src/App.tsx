import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import type { DataAdapter, Session } from './data/adapter'
import { getAdapter, isConfigured } from './data'
import { AppProvider } from './state/AppContext'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { Login } from './pages/Login'
import { NotConfigured } from './pages/NotConfigured'
import { Dashboard } from './pages/Dashboard'
import { Attendance } from './pages/Attendance'
import { Customers } from './pages/Customers'
import { CustomerDetail } from './pages/CustomerDetail'
import { SubscriptionForm } from './pages/SubscriptionForm'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'

const DEMO_FLAG = 'tiffin-use-demo'

function demoRequested(): boolean {
  if (window.location.hash.includes('demo=1')) {
    sessionStorage.setItem(DEMO_FLAG, '1')
    return true
  }
  return sessionStorage.getItem(DEMO_FLAG) === '1'
}

export default function App() {
  const [demo, setDemo] = useState(demoRequested)
  const [adapter, setAdapter] = useState<DataAdapter | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    if (!isConfigured() && !demo) {
      setBooted(true)
      return
    }
    const a = getAdapter(demo)
    setAdapter(a)
    a.getSession()
      .then((s) => setSession(s))
      .finally(() => setBooted(true))
  }, [demo])

  if (!booted) return <Spinner />

  if (!adapter) {
    return (
      <NotConfigured
        onTryDemo={() => {
          sessionStorage.setItem(DEMO_FLAG, '1')
          setDemo(true)
        }}
      />
    )
  }

  if (!session) {
    return (
      <Login
        adapter={adapter}
        onSignedIn={async () => setSession(await adapter.getSession())}
        onTryDemo={() => {
          sessionStorage.setItem(DEMO_FLAG, '1')
          setDemo(true)
        }}
      />
    )
  }

  return (
    <AppProvider
      adapter={adapter}
      session={session}
      onSignOut={() => {
        sessionStorage.removeItem(DEMO_FLAG)
        window.location.hash = '#/'
        window.location.reload()
      }}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/subscribe" element={<SubscriptionForm />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
