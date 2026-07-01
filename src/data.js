export const palette = {
  blue: { color: '#2467e8', bg: '#edf5ff', border: '#a8c6ff', icon: '⊛' },
  green: { color: '#48be6f', bg: '#eefaf2', border: '#a8e5b8', icon: '✣' },
  orange: { color: '#f5a035', bg: '#fff5e8', border: '#f7c783', icon: '⌁' },
  purple: { color: '#8b5cf6', bg: '#f4eeff', border: '#ccb7ff', icon: '♙' },
  violet: { color: '#7c3aed', bg: '#f3edff', border: '#c4b5fd', icon: '☷' }
};

export const initialTree = {
  id: 'artificial-intelligence',
  label: 'Artificial Intelligence',
  color: 'violet',
  selected: false,
  expanded: true,
  children: [
    {
      id: 'machine-learning',
      label: 'Machine Learning',
      color: 'blue',
      selected: true,
      expanded: true,
      children: [
        {
          id: 'supervised-learning',
          label: 'Supervised Learning',
          color: 'blue',
          selected: true,
          expanded: true,
          children: [
            { id: 'regression', label: 'Regression', color: 'blue', selected: true, expanded: false, children: [] },
            { id: 'classification', label: 'Classification', color: 'blue', selected: true, expanded: false, children: [] },
            { id: 'clustering', label: 'Clustering', color: 'blue', selected: false, expanded: false, children: [] }
          ]
        },
        { id: 'unsupervised-learning', label: 'Unsupervised Learning', color: 'blue', selected: false, expanded: false, children: [] },
        { id: 'reinforcement-learning', label: 'Reinforcement Learning', color: 'blue', selected: false, expanded: false, children: [] }
      ]
    },
    {
      id: 'natural-language-processing',
      label: 'Natural Language Processing',
      color: 'green',
      selected: true,
      expanded: true,
      children: [
        { id: 'text-analysis', label: 'Text Analysis', color: 'green', selected: false, expanded: false, children: [] },
        { id: 'language-models', label: 'Language Models', color: 'green', selected: true, expanded: false, children: [] }
      ]
    },
    {
      id: 'computer-vision',
      label: 'Computer Vision',
      color: 'orange',
      selected: false,
      expanded: true,
      children: [
        { id: 'image-recognition', label: 'Image Recognition', color: 'orange', selected: false, expanded: false, children: [] },
        { id: 'object-detection', label: 'Object Detection', color: 'orange', selected: false, expanded: false, children: [] }
      ]
    },
    {
      id: 'robotics',
      label: 'Robotics',
      color: 'purple',
      selected: false,
      expanded: true,
      children: [
        { id: 'navigation', label: 'Navigation', color: 'purple', selected: false, expanded: false, children: [] },
        { id: 'machine-perception', label: 'Machine Perception', color: 'purple', selected: false, expanded: false, children: [] }
      ]
    }
  ]
};

export const sampleReport = {
  title: 'Artificial Intelligence',
  summary: 'A deep dive into selected topics from the recursive subject tree.',
  sections: [
    {
      path: ['Artificial Intelligence', 'Machine Learning'],
      title: 'Machine Learning',
      overview: 'Machine learning is the area of AI focused on systems that improve from data rather than explicit hand-written instructions.',
      whyItMatters: 'It powers prediction, recommendation, automation, pattern detection, and adaptive interfaces across modern software.',
      keyTakeaways: [
        'Start with the difference between features, labels, training data, and evaluation data.',
        'Model quality depends as much on problem framing and data quality as on the algorithm.',
        'Always connect learning concepts to measurable outcomes and failure modes.'
      ],
      examples: ['Spam filtering', 'Demand forecasting', 'Personalized learning paths'],
      pitfalls: ['Confusing correlation with causation', 'Ignoring data leakage', 'Optimizing for the wrong metric'],
      nextSteps: ['Learn train/test split', 'Compare simple baselines', 'Explore model interpretability']
    }
  ]
};
