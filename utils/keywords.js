
function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[_?.’']/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}



function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  if (Math.abs(a.length - b.length) > 3) return false;

  let mismatches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) mismatches++;
    if (mismatches > 2) return false;
  }
  return true;
}


export const FIELD_INTENTS = {


  intended_degree_level: {
    weight: 1.4,
    phrases: [
      "level of degree",
      "degree are you planning",
      "planning to join",
      "degree level"
    ],
    tokens: ["degree", "level", "planning", "join", "masters", "bachelors"]
  },

  preferred_degree_program: {
    weight: 1.4,
    phrases: [
      "preferred masters degree",
      "preferred degree",
      "degree program",
      "masters degree"
    ],
    tokens: ["masters", "mba", "degree", "program"]
  },

  highest_degree: {
    weight: 1.2,
    phrases: [
      "highest qualification",
      "highest degree",
      "last degree",
      "education qualification"
    ],
    tokens: ["degree", "qualification", "education"]
  },


  current_profession: {
    weight: 1.3,
    phrases: [
      "working professional",
      "currently working",
      "are you working",
      "job status",
      "employment status"
    ],
    tokens: ["profession", "professional", "job", "working", "employed"]
  },


  completion_year: {
    weight: 1.3,
    phrases: [
      "year you completed",
      "year of graduation",
      "graduation year",
      "completed graduation",
      "passing year"
    ],
    tokens: ["year", "graduation", "completed", "passout"]
  },


  student_current_state: {
    weight: 1.1,
    phrases: ["current state", "residential state"],
    tokens: ["state", "province", "region"]
  },

  student_current_city: {
    weight: 1.1,
    phrases: ["current city", "residential city"],
    tokens: ["city", "town", "location"]
  },


  preferred_budget: {
    weight: 1.0,
    phrases: ["budget range", "your budget", "fee budget"],
    tokens: ["budget", "fees", "amount", "cost", "price"],
    requiresToken: true   
  },


  preferred_specialization: {
    weight: 1.1,
    phrases: ["preferred specialization", "chosen branch"],
    tokens: ["specialization", "branch", "field"]
  },

  student_age: {
    weight: 1.0,
    phrases: ["your age", "age of student"],
    tokens: ["age"]
  }
};



function scoreIntent(question, intent) {
  const q = normalize(question);
  const qWords = q.split(" ");

  let score = 0;
  let matched = false;

  intent.phrases.forEach(phrase => {
    if (q.includes(phrase)) {
      score += 4;
      matched = true;
    }
  });

  intent.tokens.forEach(token => {
    if (qWords.some(word => word === token || fuzzyMatch(word, token))) {
      score += 1;
      matched = true;
    }
  });

  if (!matched) return 0;

  if (intent.requiresToken) {
    const hasMoneyWord = intent.tokens.some(t =>
      qWords.some(w => w === t)
    );
    if (!hasMoneyWord) return 0;
  }

  return score * intent.weight;
}


export function mapAnswersByKeyword(questionAnswerArray) {
  const result = {};
  const confidence = {};

  questionAnswerArray.forEach(({ question, answer }) => {
    let bestField = null;
    let bestScore = 0;

    for (const [field, intent] of Object.entries(FIELD_INTENTS)) {
      const score = scoreIntent(question, intent);
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }

    if (bestScore >= 3 && bestField) {
      if (!confidence[bestField] || bestScore > confidence[bestField]) {
        result[bestField] = answer;
        confidence[bestField] = bestScore;
      }
    }
  });

  return result;
}


// const input =[{"answer":"2023","question":"select_the_year_you_completed_your_graduation."},{"answer":"yes","question":"are_you_working_professional?"}]

// console.log(mapAnswersByKeyword(input));
