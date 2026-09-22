import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f4f6fa' }}>
          <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
            <h2 style={{ color: 'var(--navy)' }}>Something went wrong</h2>
            <p className="small muted">{this.state.error.message}</p>
            <button className="btn primary" onClick={() => { this.setState({ error: null }); location.reload() }}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
