const InternalSuapeProvider = {
  async load() {
    return { available: false, people: [], dataset: null };
  },
};

module.exports = { InternalSuapeProvider };
