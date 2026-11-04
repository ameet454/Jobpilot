import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/** If one screen crashes, show a recoverable message there instead of a blank app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    // Moving to another tab gives the screen a fresh start.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="card crash" role="alert">
        <span className="hero-icon gold" aria-hidden="true"><AlertTriangle size={26} /></span>
        <h2>Something went wrong on this screen</h2>
        <p className="muted small">Your data is safe on this phone. Try again, or open another tab.</p>
        <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
      </section>
    );
  }
}
