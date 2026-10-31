import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  )
}
