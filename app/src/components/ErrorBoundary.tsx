import React from 'react';
/** R56: 模块级错误边界 —— 单面板崩溃不拖垮全站,显示重载按钮。 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div className="p-4 m-2 rounded-lg border border-vuln-critical/40 bg-vuln-critical/10 text-[11px] text-vuln-critical space-y-2" data-error-boundary>
          <div className="font-semibold">面板渲染出错: {this.state.err.message.slice(0, 120)}</div>
          <button onClick={() => this.setState({ err: null })} className="px-2 py-1 rounded border border-vuln-critical/40 hover:bg-vuln-critical/20">重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
