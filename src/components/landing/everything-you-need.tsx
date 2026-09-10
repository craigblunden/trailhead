interface CardProps {
  heading: string;
  content: string;
}

const Card = ({ heading, content }: CardProps) => {
  return (
    <div className="flex flex-col gap-2 bg-muted p-6 rounded-sm">
      <div className="w-10 h-10 bg-blue-400 rounded-sm"></div>
      <p>
        <strong>{heading}</strong>
      </p>
      <p>{content}</p>
    </div>
  );
};

export const EveryThingYouNeed = () => {
  return (
    <div className="flex justify-center flex-col items-center bg-white py-14">
      <h2 className="mb-10 text-3xl font-heading">
        Everything you need for the climb
      </h2>
      <div className="flex max-w-4xl justify-between gap-4">
        <Card
          heading="A board with stages"
          content="Drag roles from Interested through Applied, Interviewing, and Offer. See salary, location, and dates at a glance."
        />
        <Card
          heading="A page per application"
          content="The posting link, the resume you sent, the job description, contacts, notes, and a timeline of every move."
        />
        <Card
          heading="Cover letters, on the way"
          content="Keep each job description current — soon Trailhead will draft a tailored cover letter from it and your resume."
        />
      </div>
    </div>
  );
};
