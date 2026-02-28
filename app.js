
// Anchorage length calcuation Rev-1
// Prepared by: Venkata Srikanth Gummadi
// Reviewed by: Corrigan, Tom 
// Deployed Date: 28/02/2026
(function(){
  const diameters = [6,8,10,12,14,16,20,25,28,32,40,50];
  const el = id => document.getElementById(id);
  const fmtLen = n => isFinite(n) ? Math.round(n).toLocaleString() : '—';
  const fmt2   = n => isFinite(n) ? (Math.round(n*100)/100).toLocaleString() : '—';
  const num = (id, def=0) => { const v = parseFloat(el(id).value); return isNaN(v) ? def : v; };

  // --- NEW: calculation gating (only after Calculate button) ---
  let hasCalculated = false;

  function resetOutputs(message){
    // Summary placeholders
    el('inputLbd').textContent = '—';
    el('eta1').textContent = '—';
    el('fctd').textContent = '—';
    el('inputPhi').textContent = '';

    // Clear table body
    const tbody = document.querySelector('#resultTable tbody');
    if(tbody) tbody.innerHTML = '';

    // Details placeholder
    el('detailContent').innerHTML = `
      <p>${message || 'Enter inputs then press <strong>Calculate</strong> to generate results.'}</p>
    `;
  }

  function markPending(){
    // Any edit invalidates shown results until Calculate is pressed again
    hasCalculated = false;
    resetOutputs('Inputs changed. Press <strong>Calculate</strong> to update results.');
  }

  function themeInit(){
    const toggle = el('themeToggle');
    const saved = localStorage.getItem('theme');
    if(saved){
      document.documentElement.setAttribute('data-theme', saved);
      toggle.checked = saved === 'dark';
    }
    toggle.addEventListener('change', () => {
      const theme = toggle.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    });
  }

  function bindPrint(){
    el('printBtn').addEventListener('click', () => window.print());
  }

  function computeFctm(fck){
    if (fck <= 50) return 0.3 * Math.pow(fck, 2/3);
    const fcm = fck + 8;
    return 2.12 * Math.log(1 + fcm/10);
  }

  function computeFctd(fck, gammaC){
    const fctm = computeFctm(fck);
    const fctk005 = 0.7 * fctm;
    return fctk005 / gammaC;
  }

  const eta1FromBond = b => (b==='a' || b==='b') ? 1.0 : 0.7;
  const eta2FromPhi  = phi => (phi<=32) ? 1.0 : (132-phi)/100.0;
  const kFromBarPos  = p => p==='fully' ? 0.10 : (p==='partial' ? 0.05 : 0.0);

  function cdFromForm(barForm,a,c,c1){
    if(barForm==='straight') return Math.min(a/2,c1,c);
    if(barForm==='hooked')   return Math.min(a/2,c1);
    if(barForm==='loop')     return c;
    return Math.min(a/2,c1,c);
  }

  function alpha1(barForm,cd,phi,isComp){
    if(isComp) return 1.0;
    if(barForm==='hooked') return (cd>3*phi)?0.7:1.0;
    return 1.0;
  }

  function alpha2(barForm,cd,phi,isComp){
    if(isComp) return 1.0;
    let v;
    if(barForm==='hooked') v = 1 - 0.15 * ((cd-3*phi)/phi);
    else                   v = 1 - 0.15 * ((cd-phi)/phi);
    return Math.max(0.7, Math.min(1.0, v));
  }

  function alpha3(elementType,barPos,sumAst,phi,isComp){
    if(isComp) return 1.0;
    const K = kFromBarPos(barPos);
    const As = Math.PI*phi*phi/4;
    const sumAstMin = (elementType==='beam') ? 0.25*As : 0.0;
    const lambda = (sumAst - sumAstMin) / As;
    let a3 = 1 - K*lambda;
    return Math.max(0.7, Math.min(1.0, a3));
  }

  const alpha4 = isWelded => isWelded ? 0.7 : 1.0;

  function alpha5(p,isComp){
    if(isComp) return 1.0;
    let a5 = 1 - 0.04*p;
    return Math.max(0.7, Math.min(1.0, a5));
  }

  function compute(){
    // Results should only appear after this is called (Calculate button)
    hasCalculated = true;

    const phiInput = num('phiInput', 16);

    const sigmaSdIn = num('sigmaSd', 435);
    const fckIn     = num('fck', 30);
    const fyk       = num('fyk', 500);
    const gammaC    = num('gammaC', 1.5);
    const gammaS    = num('gammaS', 1.15);

    const a      = num('a', 100);
    const c      = num('c', 30);
    const c1     = num('c1', 30);
    const sumAst = num('sumAst', 0);
    const p      = num('p', 0);

    const bondCond    = el('bondCond').value;
    const barForm     = (el('barForm').value==='hooked') ? 'hooked' : (el('barForm').value==='loop' ? 'loop' : 'straight');
    const barPos      = el('barPos').value;
    const elementType = el('elementType').value;
    const isWelded    = el('welded').value==='yes';

    // --- FIX #2: Limit σsd by fyd = fyk/γs ---
    const fyd = (gammaS > 0) ? (fyk / gammaS) : Infinity;
    const sigmaLimited = Math.abs(sigmaSdIn) > fyd + 1e-12;
    const sigmaSdUsed = (sigmaSdIn === 0) ? 0 : Math.sign(sigmaSdIn) * Math.min(Math.abs(sigmaSdIn), fyd);

    const isCompression = sigmaSdUsed < 0;
    const absSigma = Math.abs(sigmaSdUsed);

    // --- FIX #3: Limit fbd based on fck=60 MPa ---
    const fckForFbd = Math.min(fckIn, 60);
    const fckLimited = fckIn > 60;

    const fctd = computeFctd(fckForFbd, gammaC);
    const eta1 = eta1FromBond(bondCond);

    el('fctd').textContent = fmt2(fctd);
    el('eta1').textContent = fmt2(eta1);
    el('inputPhi').textContent = `for φ = ${fmt2(phiInput)} mm`;

    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';

    let rowsData = [];

    function buildRow(phi){
      const eta2 = eta2FromPhi(phi);
      const fbd  = 2.25 * eta1 * eta2 * fctd;
      const lb_rqd = (fbd > 0) ? (phi * absSigma / (4 * fbd)) : NaN;

      const cd = cdFromForm(barForm, a, c, c1);
      const a1 = alpha1(barForm, cd, phi, isCompression);
      const a2 = alpha2(barForm, cd, phi, isCompression);
      const a3 = alpha3(elementType, barPos, sumAst, phi, isCompression);
      const a4 = alpha4(isWelded);
      const a5 = alpha5(p, isCompression);

      const prod235 = a2 * a3 * a5;
      const prod235eff = Math.max(0.7, prod235);

      const lbd = a1 * a4 * prod235eff * lb_rqd;

      const lb_min = isCompression
        ? Math.max(0.6*lb_rqd, 10*phi, 100)
        : Math.max(0.3*lb_rqd, 10*phi, 100);

      const lbdReq = Math.max(lbd, lb_min);

      return {
        phi, eta2, fbd, lb_rqd, cd,
        a1, a2, a3, a4, a5,
        prod235, prod235eff,
        lbd, lb_min, lbdReq,
        params: {
          // store both input and used values for transparency
          sigmaSdIn,
          sigmaSdUsed,
          sigmaLimited,
          fyd,
          fyk,
          gammaS,

          fckIn,
          fckForFbd,
          fckLimited,

          gammaC,
          a, c, c1, sumAst, p,
          bondCond, barForm, barPos, elementType,
          isWelded,
          isCompression,
          eta1
        }
      };
    }

    // Build input diameter row (used for summary + default details)
    const inputRow = buildRow(phiInput);
    rowsData.push(inputRow);

    // Summary: required lbd for input diameter
    el('inputLbd').textContent = fmtLen(inputRow.lbdReq) + ' mm';

    // Build standard diameters table
    diameters.forEach(phi => {
      const row = buildRow(phi);
      rowsData.push(row);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmt2(phi)}</td>
        <td>${fmt2(row.fbd)}</td>
        <td>${fmt2(row.lb_rqd)}</td>
        <td>${fmt2(row.a1)}</td>
        <td>${fmt2(row.prod235eff)}</td>
        <td>${fmt2(row.a4)}</td>
        <td>${fmt2(row.lbd)}</td>
        <td>${fmt2(row.lb_min)}</td>
        <td><strong>${fmtLen(row.lbdReq)}</strong></td>
      `;
      tr.addEventListener('click', () => renderDetails(row));
      tbody.appendChild(tr);
    });

    // Divider + input diameter row at bottom (as in original behaviour)
    const trTitle = document.createElement('tr');
    trTitle.innerHTML = `<td colspan="9" style="text-align:left;font-weight:700;background:rgba(14,165,233,0.08)">Values for input diameter</td>`;
    tbody.appendChild(trTitle);

    const trIn = document.createElement('tr');
    trIn.innerHTML = `
      <td>${fmt2(inputRow.phi)}</td>
      <td>${fmt2(inputRow.fbd)}</td>
      <td>${fmt2(inputRow.lb_rqd)}</td>
      <td>${fmt2(inputRow.a1)}</td>
      <td>${fmt2(inputRow.prod235eff)}</td>
      <td>${fmt2(inputRow.a4)}</td>
      <td>${fmt2(inputRow.lbd)}</td>
      <td>${fmt2(inputRow.lb_min)}</td>
      <td><strong>${fmtLen(inputRow.lbdReq)}</strong></td>
    `;
    trIn.addEventListener('click', () => renderDetails(inputRow));
    tbody.appendChild(trIn);

    // Render details for input diameter after calculate
    renderDetails(inputRow);
  }

  function renderDetails(d){
    const dc = el('detailContent');
    const s = d.params;

    const stressState = s.isCompression ? 'Compression' : 'Tension';
    const eta1Class = (s.bondCond==='a' || s.bondCond==='b') ? 'Good' : 'Poor';

    // Recompute fctd with the (possibly capped) fck used for fbd display transparency
    const fctmLoc = computeFctm(s.fckForFbd);
    const fctk005 = 0.7 * fctmLoc;
    const fctdLoc = fctk005 / s.gammaC;

    const kVal = (s.barPos==='fully') ? 0.10 : (s.barPos==='partial' ? 0.05 : 0.0);
    const alpha4Label = s.isWelded ? 'welded' : 'not welded';

    const sigmaLine = s.sigmaLimited
      ? `σ<sub>sd,input</sub> = ${fmt2(Math.abs(s.sigmaSdIn))} MPa, limited to σ<sub>sd,used</sub> = ${fmt2(Math.abs(s.sigmaSdUsed))} MPa ≤ f<sub>yd</sub> = ${fmt2(s.fyd)} MPa`
      : `σ<sub>sd</sub> = ${fmt2(Math.abs(s.sigmaSdUsed))} MPa (≤ f<sub>yd</sub> = ${fmt2(s.fyd)} MPa)`;

    const fckNote = s.fckLimited
      ? `<p class="muted"><strong>Note:</strong> f<sub>ck</sub> was capped at 60 MPa for f<sub>bd</sub> (input f<sub>ck</sub> = ${fmt2(s.fckIn)} MPa).</p>`
      : ``;

    dc.innerHTML = `
      <h3>Selected diameter: φ = ${fmt2(d.phi)} mm</h3>

      <p><strong>Stress state:</strong> ${stressState}. Using ${sigmaLine}.</p>
      ${fckNote}

      <h4>1) Design bond strength f<sub>bd</sub></h4>
      <p class="formula">
        f<sub>ctm</sub> = ${fmt2(fctmLoc)} MPa,<br/>
        f<sub>ctk;0.05</sub> = 0.7 · f<sub>ctm</sub> = ${fmt2(fctk005)} MPa,<br/>
        f<sub>ctd</sub> = f<sub>ctk;0.05</sub> / γ<sub>c</sub> = ${fmt2(fctdLoc)} MPa.<br/>
        η<sub>1</sub> (${eta1Class} bond) = ${fmt2(s.eta1)}, η<sub>2</sub> (bar size) = ${fmt2(d.eta2)}.<br/>
        <strong>f<sub>bd</sub> = 2.25 · η<sub>1</sub> · η<sub>2</sub> · f<sub>ctd</sub> = ${fmt2(d.fbd)} MPa</strong>
      </p>

      <h4>2) Basic required anchorage length l<sub>b,rqd</sub></h4>
      <p class="formula">
        l<sub>b,rqd</sub> = φ · σ<sub>sd</sub> / (4 · f<sub>bd</sub>) =
        ${fmt2(d.phi)} · ${fmt2(Math.abs(s.sigmaSdUsed))} / (4 · ${fmt2(d.fbd)}) =
        <strong>${fmt2(d.lb_rqd)} mm</strong>
      </p>

      <h4>3) α-factors</h4>
      <ul>
        <li>c<sub>d</sub> = ${fmt2(d.cd)} mm (from bar form & cover/spacing)</li>
        <li>α<sub>1</sub> (bar form) = ${fmt2(d.a1)}</li>
        <li>α<sub>2</sub> (cover/spacing) = ${fmt2(d.a2)}</li>
        <li>α<sub>3</sub> (transverse reinforcement): K = ${fmt2(kVal)}, ΣA<sub>st</sub> = ${fmt2(s.sumAst)} mm² ⇒ α<sub>3</sub> = ${fmt2(d.a3)}</li>
        <li>α<sub>4</sub> (${alpha4Label}) = ${fmt2(d.a4)}</li>
        <li>α<sub>5</sub> (transverse pressure p = ${fmt2(s.p)} MPa) = ${fmt2(d.a5)}</li>
        <li>Check: (α₂·α₃·α₅) = ${fmt2(d.prod235)} ⇒ applied as <strong>${fmt2(d.prod235eff)} (≥ 0.7)</strong></li>
      </ul>

      <h4>4) Design anchorage & minimum</h4>
      <p class="formula">
        l<sub>bd</sub> = α<sub>1</sub> · α<sub>4</sub> · (α₂·α₃·α₅)<sub>eff</sub> · l<sub>b,rqd</sub> =
        ${fmt2(d.a1)} · ${fmt2(d.a4)} · ${fmt2(d.prod235eff)} · ${fmt2(d.lb_rqd)} =
        <strong>${fmt2(d.lbd)} mm</strong><br/>
        l<sub>b,min</sub> = ${s.isCompression ? 'max(0.6·l<sub>b,rqd</sub>, 10φ, 100)' : 'max(0.3·l<sub>b,rqd</sub>, 10φ, 100)'} =
        <strong>${fmt2(d.lb_min)} mm</strong>
      </p>

      <h4>5) Required anchorage length</h4>
      <p class="formula"><strong>l<sub>bd,req</sub> = max(l<sub>bd</sub>, l<sub>b,min</sub>) = ${fmtLen(d.lbdReq)} mm</strong></p>
    `;
  }

  function init(){
    themeInit();
    bindPrint();

    // Calculate only on button click
    el('calcBtn').addEventListener('click', compute);

    // Any input change should NOT calculate; just mark results as pending
    const controls = document.querySelectorAll('#inputForm input, #inputForm select');
    controls.forEach(ctrl => {
      ctrl.addEventListener('change', markPending);
      ctrl.addEventListener('input', markPending);
    });

    // Initial state: no results until Calculate is pressed
    resetOutputs('Enter inputs then press <strong>Calculate</strong> to see results.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();