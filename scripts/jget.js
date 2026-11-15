/* jget — tiny stdin-JSON extractor for bash QA scripts.
   usage: curl ... | node jget.js 'j=>j.order.orderNumber'
          curl ... | node jget.js 'j=>j.items.find(x=>x.orderNumber===A[0])._id'
   A = extra CLI args array. Prints value, or ERR/PARSE_ERR on failure. */
let d = '';
process.stdin.on('data', (c) => (d += c)).on('end', () => {
  let j;
  try { j = JSON.parse(d); } catch (e) { console.log('PARSE_ERR'); return; }
  try {
    const A = process.argv.slice(3);
    const f = eval(process.argv[2]);
    const out = f(j, A);
    console.log(out === undefined || out === null ? '' : String(out));
  } catch (e) { console.log('ERR'); }
});
