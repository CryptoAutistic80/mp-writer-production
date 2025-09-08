export default function UserAddress() {
  return (
    <div className="container">
      <h2 id="find-mp-heading" className="section-title">Find your MP</h2>
      <p className="section-sub">Enter your UK postcode to look up your constituency MP.</p>

      <form className="form-grid" aria-labelledby="find-mp-heading">
        <div className="field">
          <label htmlFor="postcode" className="label">Postcode</label>
          <input
            id="postcode"
            name="postcode"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="e.g. SW1A 1AA"
            className="input"
          />
        </div>

        <div className="actions">
          <button type="button" className="btn-primary">Find my MP</button>
          <p className="fineprint" style={{ marginLeft: 12 }}>We’ll never post anywhere on your behalf.</p>
        </div>

        <div className="result" aria-live="polite">
          <div className="result-placeholder">
            Your MP will appear here after lookup.
          </div>
        </div>
      </form>
    </div>
  );
}
