export async function getServerSideProps() {
  return { props: { time: new Date().toISOString() } };
}

export default function Test({ time }: { time: string }) {
  return <div>Server time: {time}</div>;
}
