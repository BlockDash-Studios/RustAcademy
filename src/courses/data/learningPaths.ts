export interface LearningPathMetadata {
  id: string;
  track: 'beginner' | 'intermediate' | 'advanced';
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  prerequisites: string[];
  estimatedTime: {
    weeks: number;
    hoursPerWeek: number;
    totalHours: number;
  };
  skillsCovered: string[];
  courseCount: number;
  projects: number;
  certificateAvailable: boolean;
  price: {
    amount: number;
    currency: string;
  };
  learningOutcomes: string[];
  targetAudience: string[];
  toolsAndTechnologies: string[];
}

export const learningPaths: LearningPathMetadata[] = [
  {
    id: 'path-beginner',
    track: 'beginner',
    title: 'Beginner Track - Foundations of Programming',
    description: 'Start your coding journey from absolute zero. Learn the fundamentals of programming, logic, and problem-solving with hands-on projects. No prior experience required.',
    difficulty: 1,
    prerequisites: [
      'No prior programming experience required',
      'Basic computer literacy',
      'Willingness to learn'
    ],
    estimatedTime: {
      weeks: 8,
      hoursPerWeek: 10,
      totalHours: 80
    },
    skillsCovered: [
      'Programming fundamentals',
      'Variables and data types',
      'Control flow (if/else, loops)',
      'Functions and scope',
      'Basic data structures',
      'Debugging techniques',
      'Version control (Git basics)',
      'Problem-solving skills'
    ],
    courseCount: 6,
    projects: 4,
    certificateAvailable: true,
    price: {
      amount: 0,
      currency: 'USD'
    },
    learningOutcomes: [
      'Write clean, readable code',
      'Solve basic programming problems',
      'Build simple applications',
      'Understand core programming concepts',
      'Work with basic data structures'
    ],
    targetAudience: [
      'Complete beginners to programming',
      'Career changers entering tech',
      'Students exploring computer science'
    ],
    toolsAndTechnologies: [
      'JavaScript/TypeScript',
      'VS Code',
      'Git',
      'Command line basics',
      'Node.js'
    ]
  },
  {
    id: 'path-intermediate',
    track: 'intermediate',
    title: 'Intermediate Track - Full Stack Development',
    description: 'Level up your skills with full-stack development. Build real-world applications using modern frameworks, databases, and cloud services. Perfect for those with foundational knowledge.',
    difficulty: 2,
    prerequisites: [
      'Basic programming knowledge (variables, loops, functions)',
      'Familiarity with JavaScript or Python',
      'Understanding of HTML/CSS basics'
    ],
    estimatedTime: {
      weeks: 12,
      hoursPerWeek: 15,
      totalHours: 180
    },
    skillsCovered: [
      'Frontend frameworks (React/Vue)',
      'Backend development (Node.js/Express)',
      'Database design and management',
      'REST API design',
      'Authentication and authorization',
      'Testing (unit, integration)',
      'Deployment and hosting',
      'Performance optimization'
    ],
    courseCount: 10,
    projects: 6,
    certificateAvailable: true,
    price: {
      amount: 199,
      currency: 'USD'
    },
    learningOutcomes: [
      'Build full-stack web applications',
      'Design and implement REST APIs',
      'Work with SQL and NoSQL databases',
      'Deploy applications to the cloud',
      'Write comprehensive tests'
    ],
    targetAudience: [
      'Junior developers looking to advance',
      'Self-taught programmers seeking formal structure',
      'Computer science students',
      'Career advancers in tech'
    ],
    toolsAndTechnologies: [
      'React.js',
      'Node.js',
      'Express.js',
      'PostgreSQL',
      'MongoDB',
      'Docker',
      'AWS/Cloud basics'
    ]
  },
  {
    id: 'path-advanced',
    track: 'advanced',
    title: 'Advanced Track - System Architecture & DevOps',
    description: 'Master advanced concepts in system design, microservices, cloud infrastructure, and DevOps practices. For experienced developers ready to become tech leads and architects.',
    difficulty: 3,
    prerequisites: [
      'Strong programming skills',
      'Experience with full-stack development',
      'Understanding of databases and APIs',
      'Familiarity with cloud services'
    ],
    estimatedTime: {
      weeks: 16,
      hoursPerWeek: 20,
      totalHours: 320
    },
    skillsCovered: [
      'System design and architecture',
      'Microservices architecture',
      'Cloud infrastructure (AWS/Azure/GCP)',
      'DevOps and CI/CD pipelines',
      'Containerization (Docker, Kubernetes)',
      'Security best practices',
      'Performance optimization at scale',
      'Message queues and event-driven architecture',
      'Monitoring and observability',
      'Database optimization and sharding'
    ],
    courseCount: 14,
    projects: 8,
    certificateAvailable: true,
    price: {
      amount: 399,
      currency: 'USD'
    },
    learningOutcomes: [
      'Design scalable systems',
      'Implement microservices architecture',
      'Manage cloud infrastructure',
      'Build CI/CD pipelines',
      'Lead technical architecture decisions',
      'Optimize system performance'
    ],
    targetAudience: [
      'Senior developers seeking architecture roles',
      'Tech leads and team leads',
      'DevOps engineers',
      'System architects'
    ],
    toolsAndTechnologies: [
      'Kubernetes',
      'Docker',
      'AWS/Azure/GCP',
      'Terraform',
      'Kafka/RabbitMQ',
      'Redis',
      'Prometheus/Grafana',
      'GitHub Actions/Jenkins'
    ]
  }
];