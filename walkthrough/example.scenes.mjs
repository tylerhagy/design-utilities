// Smallest working scenes file: an inline page, three scenes, one close-up. Copy and adapt.
//   node approve.mjs example.scenes.mjs --out /tmp/wt-example && node record.mjs example.scenes.mjs --out /tmp/wt-example && python3 mux.py /tmp/wt-example
const PAGE = `<meta charset=utf-8><body style="font:18px -apple-system,Helvetica,sans-serif;margin:60px"><h2>Orders</h2>
<ul id=list style="display:inline-block;padding-right:60px"><li>Order 1041 · Shipped</li><li>Order 1042 · Packing</li><li>Order 1043 · New</li></ul>
<button id=add style="font-size:18px;padding:8px 16px">Add order</button>
<script>add.onclick=()=>{const l=document.createElement('li');l.textContent='Order 1044 · New';list.appendChild(l)}</script></body>`

export default {
  title: 'Example walkthrough',
  prototype: 'data:text/html,' + encodeURIComponent(PAGE),
  intro: { kicker: 'Example', title: 'Orders', sub: 'A three-scene walkthrough' },
  outro: { kicker: 'That is it', lines: ['Plain page.', 'Real video.'] },
  scenes: [
    { id: 'a', core: true, screen: 'Title card.', text: `This is a tiny page with a list of orders. It shows how a walkthrough is built.`, cues: [] },
    { id: 'b', chapter: 'The list', core: true, screen: 'The order list, then a close-up.',
      text: `Here are the orders. Each one has a number and a status. We can zoom in to read them.`,
      cues: [['Here are', 'spot', '#list'], ['We can zoom', 'zoom', '#list']] },
    { id: 'c', chapter: 'Add one', core: true, screen: 'Click Add order.',
      text: `Adding an order is one click. And the list updates right away. That is the whole idea.`,
      cues: [['Adding an order', 'click', '#add'], ['That is', 'card', 'outro']] },
  ],
}
