import { fmtValue } from './format';

/** Structured property identification block below the header. */
export function PropertySummary({ name, address, company, contact }:
  { name: string; address: string; company?: string | null; contact?: string | null }) {
  return (
    <div className="rpt-property">
      <table className="rpt-kv">
        <tbody>
          <tr><th scope="row">Property</th><td>{fmtValue(name)}</td></tr>
          <tr><th scope="row">Address</th><td>{fmtValue(address)}</td></tr>
          <tr><th scope="row">Management Company</th><td>{fmtValue(company)}</td></tr>
          {contact && <tr><th scope="row">Property Contact</th><td>{contact}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
