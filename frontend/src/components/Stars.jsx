export default function Stars({ rating = 0 }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const full = rating >= i - 0.25;
    const half = !full && rating >= i - 0.75;
    stars.push(
      <svg key={i} viewBox="0 0 24 24" className={full ? '' : half ? 'half' : 'off'}>
        <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
      </svg>
    );
  }
  return <span className="inline-flex gap-px">{stars}</span>;
}
