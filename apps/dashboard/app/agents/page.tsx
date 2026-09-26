export default function AgentsPage() {
  return (
    <div>
      <h1>Agents</h1>
      <table><thead><tr><th>Agent</th><th>Status</th><th>Tools</th></tr></thead>
      <tbody>
        <tr><td>Research Agent</td><td className="mono">active</td><td className="mono">send_email, query_database</td></tr>
        <tr><td>Deploy Agent</td><td className="mono">active</td><td className="mono">delete_resource, refund</td></tr>
      </tbody></table>
    </div>
  );
}
