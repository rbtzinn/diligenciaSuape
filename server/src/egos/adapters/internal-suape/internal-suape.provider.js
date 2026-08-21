const InternalSuapeProvider = {
  async load(prisma, organization = 'SUAPE') {
    const dataset = await prisma.internalDataset.findFirst({
      where: { organization, status: 'active' },
      orderBy: { importedAt: 'desc' },
    });
    if (!dataset) return { available: false, people: [], dataset: null };

    const people = await prisma.internalPerson.findMany({
      where: { organization, affiliations: { some: { datasetId: dataset.id, current: true } } },
      select: {
        id: true,
        employeeKey: true,
        name: true,
        normalizedName: true,
        maskedCpf: true,
        organization: true,
        affiliations: {
          where: { datasetId: dataset.id, current: true },
          select: { employmentType: true, referencePeriod: true, sourceSheet: true },
        },
      },
    });
    return { available: true, people, dataset };
  },
};

module.exports = { InternalSuapeProvider };
