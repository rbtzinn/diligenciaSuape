import React, { useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Icons } from '../../../components/ui/Icons';
import type {
  EgosEntity,
  EgosEvidenceItem,
  EgosFinding,
  EgosRelationship,
  EgosResolution,
  EgosSnapshot,
} from '../types';
import '../../../styles/network-immersive.css';

interface ImmersiveNetworkTabProps {
  egos?: EgosSnapshot;
  targetCompanyName?: string;
}

type LayoutMode = 'radar' | 'chain';
type DepthFilter = '1' | '2' | 'all';

interface NetworkSelection {
  kind: 'node' | 'edge';
  id: string;
}

interface RouteItem {
  id: string;
  kind: 'node' | 'edge';
  label: string;
}

interface RouteSummary {
  targetId: string;
  targetName: string;
  hops: number;
  confidence: number | null;
  confirmed: boolean;
  evidenceCount: number;
  nodeIds: string[];
  edgeIds: string[];
  items: RouteItem[];
}

interface FilterState {
  depth: DepthFilter;
  relation: string;
  showDocuments: boolean;
}

interface ResolutionContext {
  resolution: EgosResolution;
  source?: EgosEntity;
  candidate?: EgosEntity;
  counterpart?: EgosEntity;
}

interface SuapeLinkContext {
  internalPerson: EgosEntity;
  organization?: EgosEntity;
  functionalRelationship?: EgosRelationship;
  resolution?: EgosResolution;
  direct: boolean;
}

interface KinshipContext {
  relationship: EgosRelationship;
  relative?: EgosEntity;
  evidenceCount: number;
}

interface PersonOccurrenceContext {
  relationship: EgosRelationship;
  document?: EgosEntity;
  evidence?: EgosEvidenceItem;
}

interface DirectConnectionContext {
  relationship: EgosRelationship;
  entity: EgosEntity;
  evidenceCount: number;
  direction: 'outgoing' | 'incoming';
}

const TYPE_LABELS: Record<string, string> = {
  Company: 'Empresa',
  Person: 'Pessoa',
  Address: 'Endereço',
  Sanction: 'Sanção',
  PublicOffice: 'Cargo público / PEP',
  CourtCase: 'Processo judicial',
  Document: 'Documento / publicação',
  Organization: 'Instituição',
  InvestmentFund: 'Fundo de investimento',
  InvestmentFundClass: 'Classe de fundo',
};

const CONFIRMED_STATUSES = new Set(['CONFIRMED', 'VALIDATED', 'VERIFIED']);
const RELATION_TYPE_LABELS: Record<string, string> = {
  ADMINISTERS_FUND: 'Administração do fundo',
  MANAGES_FUND: 'Gestão do fundo',
  AUDITS_FUND: 'Auditoria do fundo',
  CUSTODIAN_OF: 'Custódia do fundo',
  CONTROLS_FUND: 'Controladoria do fundo',
  RESPONSIBLE_DIRECTOR_OF: 'Diretor responsável',
  DIRECTOR_OF: 'Diretores e administradores',
  SHAREHOLDER_OF: 'Sócios e acionistas',
  LEGAL_REPRESENTATIVE_OF: 'Representantes legais',
};
const KINSHIP_RELATIONSHIPS = new Set([
  'KINSHIP',
  'FAMILY_RELATIONSHIP',
  'RELATED_TO',
  'PARENT_OF',
  'CHILD_OF',
  'SPOUSE_OF',
  'SIBLING_OF',
  'DEPENDENT_OF',
]);

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function confidencePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(Math.min(100, value <= 1 ? value * 100 : value));
}

function isConfirmed(status: string) {
  return CONFIRMED_STATUSES.has(status.toUpperCase());
}

function relationshipWeight(status: string) {
  if (isConfirmed(status)) return 1;
  return status.toUpperCase().includes('PROBABLE') ? 3 : 5;
}

function formatGeneratedAt(value?: string) {
  if (!value) return 'Data de coleta não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data de coleta não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function humanizeProperty(key: string) {
  const known: Record<string, string> = {
    cnpj: 'CNPJ',
    cpf: 'CPF',
    role: 'Papel',
    position: 'Cargo',
    source: 'Fonte',
    status: 'Situação',
    date: 'Data',
    searchedname: 'Nome pesquisado',
    maskedcpf: 'CPF mascarado',
    publicrole: 'Função pública',
    roleabbreviation: 'Sigla da função',
    rolelevel: 'Nível da função',
    publicorganization: 'Órgão público',
    publicservicestart: 'Início do exercício',
    publicserviceend: 'Fim do exercício',
    pepcoolingoffend: 'Fim da carência PEP',
    employmenttype: 'Tipo de vínculo',
    referenceperiod: 'Competência',
    sourcesheet: 'Base interna',
    identityconfirmed: 'Identidade confirmada',
    cvmfundcode: 'Código CVM',
    fundtype: 'Tipo de fundo',
    registrationdate: 'Registro na CVM',
    registrationstatus: 'Situação cadastral',
    statusstartdate: 'Início da situação',
    fiscalyearstart: 'Início do exercício social',
    fiscalyearend: 'Fim do exercício social',
    netassetvalue: 'Patrimônio líquido informado',
    netassetvaluedate: 'Data do patrimônio líquido',
    classname: 'Classe',
    classtype: 'Tipo da classe',
    condominiumform: 'Forma de condomínio',
    regulatedrole: 'Papel regulado',
    qualification: 'Qualificação',
    joinedat: 'Entrada no quadro',
    cnpjbase: 'Raiz do CNPJ',
    incompleteidentifier: 'CNPJ completo indisponível',
    relatedcompanycnpj: 'CNPJ da empresa relacionada',
    municipality: 'Município',
    state: 'UF',
  };
  if (known[key.toLowerCase()]) return known[key.toLowerCase()];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function textProperty(entity: EgosEntity | undefined, key: string) {
  const value = entity?.properties?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function maskedCpf(entity: EgosEntity | undefined) {
  const property = textProperty(entity, 'maskedCpf');
  if (property) return property;
  const identifier = entity?.identifiers?.find((item) => (
    (item.identifierType || item.type || '').toUpperCase() === 'MASKED_CPF'
  ));
  return identifier?.value || null;
}

function employmentLabel(value: string | null) {
  const labels: Record<string, string> = {
    employee: 'Empregado(a)',
    commissioned: 'Comissionado(a)',
    seconded: 'Cedido(a)',
    board_administration: 'Conselho de Administração',
    board_fiscal: 'Conselho Fiscal',
    audit_committee: 'Comitê de Auditoria',
    institutional_member: 'Vínculo institucional',
  };
  return value ? labels[value] || value.replace(/_/g, ' ') : null;
}

function displayProperty(value: unknown, key = '') {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (key.toLowerCase() === 'netassetvalue' && typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  const raw = String(value);
  if (key.toLowerCase() === 'cnpj' && /^\d{14}$/.test(raw)) {
    return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (/date|fiscalyear/i.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  return raw;
}

function touches(relationship: EgosRelationship, entityId: string) {
  return relationship.sourceEntityId === entityId || relationship.targetEntityId === entityId;
}

function otherEntityId(relationship: EgosRelationship, entityId: string) {
  return relationship.sourceEntityId === entityId
    ? relationship.targetEntityId
    : relationship.sourceEntityId;
}

function isPepCandidate(entity: EgosEntity | undefined) {
  return Boolean(entity && (
    entity.role === 'pep_candidate'
    || textProperty(entity, 'source') === 'CGU_PEP'
  ));
}

function isInternalSuapeCandidate(entity: EgosEntity | undefined) {
  return Boolean(entity && (
    entity.role === 'internal_candidate'
    || entity.properties?.internal === true
    || textProperty(entity, 'recordType') === 'functional_registry'
  ));
}

function visibleEntity(entity: EgosEntity, filters: FilterState) {
  const maxDepth = filters.depth === 'all' ? Number.POSITIVE_INFINITY : Number(filters.depth);
  if (entity.depth > maxDepth) return false;
  if (!filters.showDocuments && entity.type === 'Document') return false;
  return true;
}

function entityEvidence(egos: EgosSnapshot, entityId: string) {
  const relationshipIds = new Set(
    (egos.relationships || [])
      .filter((relationship) => touches(relationship, entityId))
      .map((relationship) => relationship.id),
  );
  return (egos.evidences || []).filter((item) => (
    item.entityId === entityId
    || Boolean(item.relationshipId && relationshipIds.has(item.relationshipId))
  ));
}

function relationshipEvidence(egos: EgosSnapshot, relationshipId: string) {
  return (egos.evidences || []).filter((item) => item.relationshipId === relationshipId);
}

function findingsForSelection(egos: EgosSnapshot, selection: NetworkSelection) {
  const relationshipIds = selection.kind === 'node'
    ? new Set(
        (egos.relationships || [])
          .filter((relationship) => touches(relationship, selection.id))
          .map((relationship) => relationship.id),
      )
    : new Set<string>();
  return (egos.findings || []).filter((finding) => (
    selection.kind === 'node'
      ? finding.entityId === selection.id
        || Boolean(finding.relationshipId && relationshipIds.has(finding.relationshipId))
      : finding.relationshipId === selection.id
  ));
}

function primitiveProperties(properties: Record<string, unknown>) {
  return Object.entries(properties)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 6);
}

const NetworkConnectionsCard: React.FC<{
  connections: DirectConnectionContext[];
  onExplore: (entityId: string) => void;
}> = ({ connections, onExplore }) => {
  const companies = connections.filter(({ entity }) => (
    entity.type === 'Company' || entity.type === 'InvestmentFund' || entity.type === 'InvestmentFundClass'
  )).length;
  const people = connections.filter(({ entity }) => entity.type === 'Person').length;

  return (
    <section className="network-direct-connections" aria-labelledby="network-connections-title">
      <header>
        <div>
          <span>Vizinhança desta entidade</span>
          <h4 id="network-connections-title">Conexões diretas</h4>
        </div>
        <strong>{connections.length}</strong>
      </header>
      {connections.length > 0 ? (
        <>
          <div className="network-connection-summary" aria-label="Tipos de entidades conectadas">
            {companies > 0 ? <span>{companies} empresa(s) ou fundo(s)</span> : null}
            {people > 0 ? <span>{people} pessoa(s)</span> : null}
            <span>{connections.filter(({ relationship }) => !isConfirmed(relationship.status)).length} em revisão</span>
          </div>
          <div className="network-connection-list">
            {connections.map(({ relationship, entity, evidenceCount, direction }) => (
              <button type="button" key={`${relationship.id}-${entity.id}`} onClick={() => onExplore(entity.id)}>
                <i className={isConfirmed(relationship.status) ? 'confirmed' : 'review'} aria-hidden="true" />
                <span>
                  <small>{relationship.label || relationship.type}</small>
                  <strong>{entity.name}</strong>
                  <em>
                    {TYPE_LABELS[entity.type] || entity.type}
                    {' · '}{isConfirmed(relationship.status) ? 'confirmada' : 'requer revisão'}
                    {' · '}{evidenceCount} evidência(s)
                    {direction === 'incoming' ? ' · vínculo recebido' : ''}
                  </em>
                </span>
                <Icons.ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p><Icons.Info size={13} aria-hidden="true" /> Selecione uma conexão para mover o foco e revelar a vizinhança da próxima entidade.</p>
        </>
      ) : (
        <div className="network-connection-empty">
          <strong>Nenhuma conexão visível</strong>
          <p>Altere a profundidade ou o filtro de relação para verificar outros vínculos disponíveis no dossiê.</p>
        </div>
      )}
    </section>
  );
};

const NetworkPepMatchCard: React.FC<{
  context: ResolutionContext;
  entities: EgosEntity[];
  relationships: EgosRelationship[];
}> = ({ context, entities, relationships }) => {
  const { resolution, source, candidate } = context;
  const officeRelationship = candidate ? relationships.find((relationship) => (
    relationship.type === 'HOLDS_PUBLIC_OFFICE' && touches(relationship, candidate.id)
  )) : undefined;
  const office = officeRelationship && candidate
    ? entities.find((entity) => entity.id === otherEntityId(officeRelationship, candidate.id))
    : undefined;
  const role = textProperty(candidate, 'publicRole') || textProperty(office, 'role');
  const organization = textProperty(candidate, 'publicOrganization') || textProperty(office, 'organization');
  const startsAt = textProperty(candidate, 'publicServiceStart') || textProperty(office, 'startsAt');
  const endsAt = textProperty(candidate, 'publicServiceEnd') || textProperty(office, 'endsAt');
  const coolingOff = textProperty(candidate, 'pepCoolingOffEnd');
  const signals = Array.isArray(resolution.signals) ? resolution.signals : [];

  return (
    <section className="network-context-card network-context-pep">
      <header>
        <span><Icons.ShieldAlert size={15} aria-hidden="true" /> Correspondência PEP</span>
        <strong>{resolution.score}<small>/100</small></strong>
      </header>
      <div className="network-context-title">
        <small>Candidato exato retornado pela CGU</small>
        <h4>{candidate?.name || resolution.candidateName || 'Nome não informado'}</h4>
        <p>Comparado com <strong>{source?.name || resolution.sourceName || 'a pessoa pesquisada'}</strong>.</p>
      </div>
      <dl className="network-context-facts">
        {maskedCpf(candidate) ? <div><dt>CPF mascarado</dt><dd>{maskedCpf(candidate)}</dd></div> : null}
        {role ? <div><dt>Função</dt><dd>{role}</dd></div> : null}
        {organization ? <div><dt>Órgão</dt><dd>{organization}</dd></div> : null}
        {startsAt || endsAt ? <div><dt>Exercício</dt><dd>{startsAt || 'não informado'} a {endsAt || 'não informado'}</dd></div> : null}
        {coolingOff ? <div><dt>Fim da carência PEP</dt><dd>{coolingOff}</dd></div> : null}
      </dl>
      <div className="network-match-breakdown">
        <span>De onde vieram os {resolution.score} pontos</span>
        {signals.map((signal) => (
          <div className={signal.matched ? 'matched' : 'not-matched'} key={`${resolution.id}-${signal.code}-${signal.detail}`}>
            {signal.matched ? <Icons.CheckCircle size={14} aria-hidden="true" /> : <Icons.Info size={14} aria-hidden="true" />}
            <p><strong>{signal.label}</strong><small>{signal.detail}{signal.weight > 0 ? ` · +${signal.weight}` : ''}</small></p>
          </div>
        ))}
      </div>
      <p className="network-context-warning"><Icons.AlertTriangle size={14} aria-hidden="true" /> Compatibilidade de campos não confirma identidade. Valide a documentação antes de concluir.</p>
    </section>
  );
};

const NetworkSuapeCard: React.FC<{ context: SuapeLinkContext }> = ({ context }) => {
  const { internalPerson, organization, functionalRelationship, resolution, direct } = context;
  const employmentType = employmentLabel(
    textProperty(internalPerson, 'employmentType')
    || (typeof functionalRelationship?.properties?.employmentType === 'string' ? functionalRelationship.properties.employmentType : null),
  );
  const referencePeriod = textProperty(internalPerson, 'referencePeriod')
    || (typeof functionalRelationship?.properties?.referencePeriod === 'string' ? functionalRelationship.properties.referencePeriod : null);
  const sourceSheet = textProperty(internalPerson, 'sourceSheet');
  const dataset = textProperty(internalPerson, 'datasetSourceName')
    || (typeof functionalRelationship?.properties?.datasetSourceName === 'string' ? functionalRelationship.properties.datasetSourceName : null);

  return (
    <section className="network-context-card network-context-suape">
      <header>
        <span><Icons.Building size={15} aria-hidden="true" /> Cruzamento funcional SUAPE</span>
        {resolution ? <strong>{resolution.score}<small>/100</small></strong> : <strong className="confirmed">Registro</strong>}
      </header>
      <div className="network-context-title">
        <small>{direct ? 'Pessoa selecionada na base interna' : 'Possível identidade correspondente'}</small>
        <h4>{internalPerson.name}</h4>
        <p>{direct
          ? `Há vínculo funcional registrado com ${organization?.name || 'SUAPE'}.`
          : `O nome selecionado pode corresponder a este registro funcional de ${organization?.name || 'SUAPE'}.`}</p>
      </div>
      <dl className="network-context-facts">
        {employmentType ? <div><dt>Tipo de vínculo</dt><dd>{employmentType}</dd></div> : null}
        {referencePeriod ? <div><dt>Competência</dt><dd>{referencePeriod}</dd></div> : null}
        {sourceSheet ? <div><dt>Grupo funcional</dt><dd>{sourceSheet}</dd></div> : null}
        {dataset ? <div><dt>Base local</dt><dd>{dataset}</dd></div> : null}
      </dl>
      {resolution ? (
        <div className="network-match-breakdown">
          <span>Campos comparados</span>
          {(resolution.signals || []).map((signal) => (
            <div className={signal.matched ? 'matched' : 'not-matched'} key={`${resolution.id}-${signal.code}-${signal.detail}`}>
              {signal.matched ? <Icons.CheckCircle size={14} aria-hidden="true" /> : <Icons.Info size={14} aria-hidden="true" />}
              <p><strong>{signal.label}</strong><small>{signal.detail}{signal.weight > 0 ? ` · +${signal.weight}` : ''}</small></p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="network-context-warning"><Icons.Info size={14} aria-hidden="true" /> A folha comprova cadastro funcional mínimo; ela não prova parentesco, conflito de interesse ou irregularidade.</p>
    </section>
  );
};

const NetworkPersonOccurrencesCard: React.FC<{
  contexts: PersonOccurrenceContext[];
  searchCovered: boolean;
}> = ({ contexts, searchCovered }) => (
  <section className={`network-context-card network-context-occurrences ${contexts.length === 0 ? 'is-empty' : ''}`}>
    <header>
      <span><Icons.Search size={15} aria-hidden="true" /> Ocorrências pessoais</span>
      <strong className={contexts.length > 0 ? 'has-data' : 'no-data'}>{contexts.length > 0 ? contexts.length : '—'}</strong>
    </header>
    {contexts.length > 0 ? (
      <>
        <div className="network-occurrence-list">
          {contexts.map(({ relationship, document, evidence }) => {
            const sourceUrl = safeExternalUrl(evidence?.sourceUrl);
            const categories = Array.isArray(document?.properties?.categories)
              ? document.properties.categories.filter((item): item is string => typeof item === 'string')
              : [];
            return (
              <article key={relationship.id}>
                <div>
                  <small>Conteúdo público associado ao nome</small>
                  <span>{confidencePercent(relationship.confidence) || '—'}/100 correlação</span>
                </div>
                <h4>{document?.name || 'Publicação na web'}</h4>
                {evidence?.excerpt ? <p>{evidence.excerpt}</p> : null}
                {categories.length > 0 ? (
                  <div className="network-occurrence-tags">
                    {categories.slice(0, 3).map((category) => <span key={category}>{category}</span>)}
                  </div>
                ) : null}
                {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Ler fonte <Icons.ExternalLink size={11} aria-hidden="true" /></a> : null}
              </article>
            );
          })}
        </div>
        <p className="network-context-warning"><Icons.AlertTriangle size={14} aria-hidden="true" /> Nome e contexto são pistas. Confirme identidade, CPF, processo e teor antes de responder à questão 5.2.</p>
      </>
    ) : (
      <div className="network-context-empty-copy">
        <strong>{searchCovered ? 'Nenhum conteúdo candidato para este nome' : 'Busca individual ainda não executada'}</strong>
        <p>{searchCovered
          ? 'A triagem nominal foi realizada sem ocorrência estruturada para esta pessoa. Isso não equivale a certidão negativa.'
          : 'Esta diligência foi criada antes da pesquisa individual por integrante. Execute novamente o CNPJ para preencher a questão 5.2.'}</p>
      </div>
    )}
  </section>
);

const NetworkKinshipCard: React.FC<{ contexts: KinshipContext[] }> = ({ contexts }) => (
  <section className={`network-context-card network-context-kinship ${contexts.length === 0 ? 'is-empty' : ''}`}>
    <header>
      <span><Icons.Users size={15} aria-hidden="true" /> Parentesco</span>
      <strong className={contexts.length > 0 ? 'has-data' : 'no-data'}>{contexts.length > 0 ? contexts.length : '—'}</strong>
    </header>
    {contexts.length > 0 ? (
      <div className="network-kinship-list">
        {contexts.map(({ relationship, relative, evidenceCount }) => (
          <article key={relationship.id}>
            <strong>{relative?.name || 'Pessoa relacionada'}</strong>
            <span>{relationship.label || relationship.type}</span>
            <small>{isConfirmed(relationship.status) ? 'Confirmado' : 'Hipótese'} · {evidenceCount} evidência(s)</small>
          </article>
        ))}
      </div>
    ) : (
      <div className="network-context-empty-copy">
        <strong>Nenhum parentesco comprovado</strong>
        <p>A base disponível não contém filiação, cônjuge ou dependentes. Sobrenome parecido e presença na mesma folha não serão tratados como parentesco.</p>
      </div>
    )}
  </section>
);

function runLayout(
  cy: cytoscape.Core,
  mode: LayoutMode,
  rootId: string | undefined,
  reduceMotion: boolean,
) {
  const visibleElements = cy.elements(':visible');
  const visibleNodes = visibleElements.nodes();
  const nodeCount = visibleNodes.length;

  if (nodeCount === 0) return;

  const padding = nodeCount >= 40 ? 44 : nodeCount >= 24 ? 58 : 76;
  const minNodeSpacing = nodeCount >= 40 ? 34 : nodeCount >= 24 ? 44 : 56;
  const root = rootId ? cy.getElementById(rootId) : undefined;
  const visibleRoot = root && root.nonempty() && root.visible() ? root : undefined;

  const common = {
    animate: !reduceMotion,
    animationDuration: reduceMotion ? 0 : 700,
    fit: true,
    padding,
    avoidOverlap: true,
  };

  cy.edges().style('curve-style', mode === 'chain' ? 'round-taxi' : 'unbundled-bezier');

  const options = mode === 'chain'
    ? {
        ...common,
        name: 'breadthfirst',
        directed: true,
        circle: false,
        grid: false,
        spacingFactor: nodeCount >= 32 ? 1.12 : 1.28,
        roots: visibleRoot,
      }
    : {
        ...common,
        name: 'concentric',
        startAngle: -Math.PI / 2,
        clockwise: true,
        minNodeSpacing,
        levelWidth: () => 1,
        concentric: (node: cytoscape.NodeSingular) => (
          node.id() === rootId
            ? 10_000
            : 100 - Number(node.data('depth') || 0) * 10
        ),
      };

  visibleElements.layout(options as cytoscape.LayoutOptions).run();
}

function applyVisibility(
  cy: cytoscape.Core,
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  filters: FilterState,
) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
  const visibleIds = new Set(
    entities.filter((entity) => visibleEntity(entity, filters)).map((entity) => entity.id),
  );

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.style('display', visibleIds.has(node.id()) ? 'element' : 'none');
    });

    cy.edges().forEach((edge) => {
      const relationship = relationshipById.get(edge.id());
      const sourceExists = relationship ? entityById.has(relationship.sourceEntityId) : false;
      const targetExists = relationship ? entityById.has(relationship.targetEntityId) : false;
      const shouldShow = Boolean(
        relationship
        && sourceExists
        && targetExists
        && visibleIds.has(relationship.sourceEntityId)
        && visibleIds.has(relationship.targetEntityId)
        && (filters.relation === 'all' || relationship.type === filters.relation),
      );
      edge.style('display', shouldShow ? 'element' : 'none');
    });
  });
}

function focusNeighborhood(
  cy: cytoscape.Core,
  node: cytoscape.NodeSingular,
  reduceMotion: boolean,
) {
  const neighborhood = node.closedNeighborhood().filter((element) => element.visible());
  cy.stop();
  cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood');
  cy.elements(':visible').not(neighborhood).addClass('is-dimmed');
  neighborhood.addClass('is-neighborhood');
  node.addClass('is-focused');
  cy.animate({
    fit: { eles: neighborhood, padding: 96 },
    duration: reduceMotion ? 0 : 520,
  });
}

export const ImmersiveNetworkTab: React.FC<ImmersiveNetworkTabProps> = ({
  egos,
  targetCompanyName = 'Empresa analisada',
}) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('radar');
  const [depth, setDepth] = useState<DepthFilter>('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [showDocuments, setShowDocuments] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selection, setSelection] = useState<NetworkSelection | null>(null);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGraphReady, setIsGraphReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const routeTimersRef = useRef<number[]>([]);
  const viewportRestoreTimerRef = useRef<number | null>(null);
  const fullscreenFitTimerRef = useRef<number | null>(null);
  const filtersRef = useRef<FilterState>({ depth, relation: relationFilter, showDocuments });
  const layoutRef = useRef<LayoutMode>(layoutMode);

  const entities = useMemo(() => egos?.entities || [], [egos?.entities]);
  const relationships = useMemo(() => egos?.relationships || [], [egos?.relationships]);
  const evidences = useMemo(() => egos?.evidences || [], [egos?.evidences]);
  const findings = useMemo(() => egos?.findings || [], [egos?.findings]);
  const resolutions = useMemo(() => egos?.resolutions || [], [egos?.resolutions]);
  const coverage = useMemo(() => egos?.coverage || [], [egos?.coverage]);

  const rootEntity = useMemo(() => {
    if (!entities.length) return undefined;
    const normalizedTarget = normalizeText(targetCompanyName);
    return entities.find((entity) => entity.role.toUpperCase() === 'ROOT')
      || entities.find((entity) => normalizeText(entity.name) === normalizedTarget)
      || entities.find((entity) => entity.depth === 0)
      || entities[0];
  }, [entities, targetCompanyName]);

  const relationTypes = useMemo(() => {
    const labels = new Map<string, string>();
    relationships.forEach((relationship) => {
      labels.set(relationship.type, RELATION_TYPE_LABELS[relationship.type] || relationship.label || relationship.type);
    });
    return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [relationships]);

  const visibleEntities = useMemo(() => entities.filter((entity) => visibleEntity(entity, {
    depth,
    relation: relationFilter,
    showDocuments,
  })), [depth, entities, relationFilter, showDocuments]);

  const selectedEntity = useMemo(() => (
    selection?.kind === 'node'
      ? entities.find((entity) => entity.id === selection.id)
      : undefined
  ), [entities, selection]);

  const selectedRelationship = useMemo(() => (
    selection?.kind === 'edge'
      ? relationships.find((relationship) => relationship.id === selection.id)
      : undefined
  ), [relationships, selection]);

  const selectedConnections = useMemo<DirectConnectionContext[]>(() => {
    if (!selectedEntity) return [];
    return relationships
      .filter((relationship) => touches(relationship, selectedEntity.id))
      .map((relationship) => ({
        relationship,
        entity: entities.find((entity) => entity.id === otherEntityId(relationship, selectedEntity.id)),
        evidenceCount: evidences.filter((evidence) => evidence.relationshipId === relationship.id).length,
        direction: relationship.sourceEntityId === selectedEntity.id ? 'outgoing' as const : 'incoming' as const,
      }))
      .filter((context): context is DirectConnectionContext => Boolean(context.entity))
      .sort((left, right) => {
        const statusOrder = Number(isConfirmed(right.relationship.status)) - Number(isConfirmed(left.relationship.status));
        return statusOrder || left.relationship.label.localeCompare(right.relationship.label, 'pt-BR');
      });
  }, [entities, evidences, relationships, selectedEntity]);

  const selectedEvidence = useMemo<EgosEvidenceItem[]>(() => {
    if (!egos || !selection) return [];
    return selection.kind === 'node'
      ? entityEvidence(egos, selection.id)
      : relationshipEvidence(egos, selection.id);
  }, [egos, selection]);

  const selectedFindings = useMemo<EgosFinding[]>(() => {
    if (!egos || !selection) return [];
    return findingsForSelection(egos, selection);
  }, [egos, selection]);

  const selectedResolutionContexts = useMemo<ResolutionContext[]>(() => {
    if (!selectedEntity) return [];
    return resolutions
      .filter((resolution) => (
        resolution.sourceEntityId === selectedEntity.id
        || resolution.candidateEntityId === selectedEntity.id
      ))
      .map((resolution) => {
        const source = entities.find((entity) => entity.id === resolution.sourceEntityId);
        const candidate = entities.find((entity) => entity.id === resolution.candidateEntityId);
        const counterpart = resolution.sourceEntityId === selectedEntity.id ? candidate : source;
        return { resolution, source, candidate, counterpart };
      });
  }, [entities, resolutions, selectedEntity]);

  const selectedPepMatches = useMemo(() => (
    selectedResolutionContexts.filter((context) => isPepCandidate(context.candidate))
  ), [selectedResolutionContexts]);

  const selectedSuapeLinks = useMemo<SuapeLinkContext[]>(() => {
    if (!selectedEntity) return [];
    const internalPeople = new Map<string, { entity: EgosEntity; resolution?: EgosResolution }>();
    if (isInternalSuapeCandidate(selectedEntity)) {
      internalPeople.set(selectedEntity.id, { entity: selectedEntity });
    }
    selectedResolutionContexts.forEach((context) => {
      const internalPerson = isInternalSuapeCandidate(context.candidate)
        ? context.candidate
        : isInternalSuapeCandidate(context.source) ? context.source : undefined;
      if (internalPerson) internalPeople.set(internalPerson.id, { entity: internalPerson, resolution: context.resolution });
    });

    return [...internalPeople.values()].map(({ entity, resolution }) => {
      const functionalRelationship = relationships.find((relationship) => (
        relationship.type === 'FUNCTIONAL_LINK' && touches(relationship, entity.id)
      ));
      const organizationId = functionalRelationship
        ? otherEntityId(functionalRelationship, entity.id)
        : null;
      const organization = organizationId
        ? entities.find((candidate) => candidate.id === organizationId)
        : undefined;
      return {
        internalPerson: entity,
        organization,
        functionalRelationship,
        resolution,
        direct: entity.id === selectedEntity.id,
      };
    });
  }, [entities, relationships, selectedEntity, selectedResolutionContexts]);

  const selectedKinships = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships
      .filter((relationship) => (
        touches(relationship, selectedEntity.id)
        && KINSHIP_RELATIONSHIPS.has(relationship.type.toUpperCase())
      ))
      .map((relationship) => ({
        relationship,
        relative: entities.find((entity) => entity.id === otherEntityId(relationship, selectedEntity.id)),
        evidenceCount: evidences.filter((evidence) => evidence.relationshipId === relationship.id).length,
      }));
  }, [entities, evidences, relationships, selectedEntity]);

  const selectedPersonOccurrences = useMemo<PersonOccurrenceContext[]>(() => {
    if (!selectedEntity || selectedEntity.type !== 'Person') return [];
    return relationships
      .filter((relationship) => (
        relationship.type === 'POSSIBLE_PERSON_OCCURRENCE'
        && touches(relationship, selectedEntity.id)
      ))
      .map((relationship) => ({
        relationship,
        document: entities.find((entity) => entity.id === otherEntityId(relationship, selectedEntity.id)),
        evidence: evidences.find((evidence) => evidence.relationshipId === relationship.id),
      }));
  }, [entities, evidences, relationships, selectedEntity]);

  const personSearchCovered = useMemo(() => {
    if (selectedPersonOccurrences.length > 0) return true;
    const mediaCoverage = coverage.find((item) => item.axis === 'MEDIA');
    return Boolean(
      mediaCoverage
      && mediaCoverage.status !== 'UNAVAILABLE'
      && normalizeText(mediaCoverage.message).includes('integrante')
    );
  }, [coverage, selectedPersonOccurrences.length]);

  const reviewCount = findings.filter((finding) => (
    finding.status === 'REVIEW' || finding.status === 'INCONCLUSIVE'
  )).length;

  const reduceMotion = useMemo(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), []);

  useEffect(() => {
    const inspector = inspectorRef.current;
    if (!inspector) return;
    inspector.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion, route?.targetId, selectedEntity?.id, selectedRelationship?.id]);

  filtersRef.current = { depth, relation: relationFilter, showDocuments };
  layoutRef.current = layoutMode;

  const clearRouteTimers = () => {
    routeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    routeTimersRef.current = [];
  };

  const clearGraphEmphasis = () => {
    clearRouteTimers();
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood is-search-match is-search-dimmed');
  };

  const closeInspector = () => {
    const wasRouteOpen = route !== null;
    setSelection(null);
    setRoute(null);
    clearGraphEmphasis();

    if (viewportRestoreTimerRef.current !== null) {
      window.clearTimeout(viewportRestoreTimerRef.current);
    }
    viewportRestoreTimerRef.current = window.setTimeout(() => {
      const cy = cyRef.current;
      viewportRestoreTimerRef.current = null;
      if (!cy || cy.destroyed()) return;
      cy.stop();
      cy.resize();
      cy.animate({
        fit: { eles: cy.elements(':visible'), padding: 80 },
        duration: reduceMotion ? 0 : 360,
      });
    }, reduceMotion ? 0 : 180);
    setAnnouncement(wasRouteOpen
      ? 'Rota fechada. Enquadramento geral restaurado.'
      : 'Exploração fechada. Enquadramento geral restaurado.');
  };

  useEffect(() => {
    const refitFullscreenGraph = () => {
      const cy = cyRef.current;
      if (!cy || cy.destroyed()) return;
      cy.stop();
      cy.resize();
      cy.fit(cy.elements(':visible'), 64);
    };

    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(refitFullscreenGraph);
      });
      if (fullscreenFitTimerRef.current !== null) {
        window.clearTimeout(fullscreenFitTimerRef.current);
      }
      fullscreenFitTimerRef.current = window.setTimeout(() => {
        fullscreenFitTimerRef.current = null;
        refitFullscreenGraph();
      }, 180);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (fullscreenFitTimerRef.current !== null) {
        window.clearTimeout(fullscreenFitTimerRef.current);
        fullscreenFitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!egos || !graphRef.current || !rootEntity) return undefined;
    let disposed = false;
    setIsGraphReady(false);

    void import('cytoscape').then(({ default: createCytoscape }) => {
      if (disposed || !graphRef.current) return;

      const reviewEntityIds = new Set(
        findings
          .filter((finding) => finding.status === 'REVIEW' || finding.status === 'INCONCLUSIVE')
          .map((finding) => finding.entityId)
          .filter((id): id is string => Boolean(id)),
      );
      const reviewRelationshipIds = new Set(
        findings
          .filter((finding) => finding.status === 'REVIEW' || finding.status === 'INCONCLUSIVE')
          .map((finding) => finding.relationshipId)
          .filter((id): id is string => Boolean(id)),
      );

      const elements: cytoscape.ElementDefinition[] = [
        ...entities.map((entity) => ({
          group: 'nodes' as const,
          data: {
            id: entity.id,
            label: entity.name,
            entityType: entity.type,
            depth: entity.depth,
            role: entity.role,
            confidence: confidencePercent(entity.confidence),
            isRoot: entity.id === rootEntity.id,
            hasReview: reviewEntityIds.has(entity.id),
          },
        })),
        ...relationships.map((relationship) => ({
          group: 'edges' as const,
          data: {
            id: relationship.id,
            source: relationship.sourceEntityId,
            target: relationship.targetEntityId,
            label: relationship.label || relationship.type,
            relationType: relationship.type,
            status: relationship.status,
            confidence: confidencePercent(relationship.confidence),
            isConfirmed: isConfirmed(relationship.status),
            hasReview: reviewRelationshipIds.has(relationship.id),
          },
        })),
      ];

      const cy = createCytoscape({
        container: graphRef.current,
        elements,
        minZoom: 0.18,
        maxZoom: 2.6,
        boxSelectionEnabled: false,
        autoungrabify: false,
        hideEdgesOnViewport: relationships.length > 220,
        textureOnViewport: entities.length > 350,
        style: [
          {
            selector: 'node',
            style: {
              width: 46,
              height: 46,
              label: 'data(label)',
              color: '#dce9f7',
              'font-family': 'Segoe UI, sans-serif',
              'font-size': 9,
              'font-weight': 600,
              'text-wrap': 'ellipsis',
              'text-max-width': '104px',
              'text-valign': 'bottom',
              'text-margin-y': 9,
              'background-color': '#173f6c',
              'border-width': 2,
              'border-color': '#6ca5d7',
              'overlay-opacity': 0,
              'transition-property': 'opacity, border-color, border-width, background-color',
              'transition-duration': 170,
            },
          },
          { selector: 'node[entityType = "Company"]', style: { shape: 'round-rectangle', 'background-color': '#2d60ad', 'border-color': '#8db8ed' } },
          { selector: 'node[entityType = "InvestmentFund"]', style: { shape: 'round-rectangle', 'background-color': '#087078', 'border-color': '#71e0d2', 'border-style': 'double', 'border-width': 4 } },
          { selector: 'node[entityType = "InvestmentFundClass"]', style: { shape: 'barrel', 'background-color': '#155a71', 'border-color': '#74cce1' } },
          { selector: 'node[entityType = "Person"]', style: { 'background-color': '#174b73', 'border-color': '#72c4eb' } },
          { selector: 'node[entityType = "Organization"]', style: { shape: 'diamond', 'background-color': '#176557', 'border-color': '#70d6b2' } },
          { selector: 'node[entityType = "PublicOffice"]', style: { shape: 'hexagon', 'background-color': '#70510e', 'border-color': '#fcb315' } },
          { selector: 'node[entityType = "Sanction"]', style: { shape: 'triangle', 'background-color': '#78363d', 'border-color': '#f38a94' } },
          { selector: 'node[entityType = "CourtCase"]', style: { shape: 'round-tag', 'background-color': '#4f3974', 'border-color': '#bca4ed' } },
          { selector: 'node[entityType = "Document"]', style: { width: 28, height: 28, label: '', shape: 'rectangle', 'background-color': '#41536b', 'border-color': '#8297ae' } },
          {
            selector: 'node[?isRoot]',
            style: {
              width: 78,
              height: 58,
              'font-size': 12,
              'font-weight': 700,
              'text-max-width': '150px',
              'border-width': 4,
              'border-color': '#fcb315',
              'background-color': '#2d60ad',
            },
          },
          { selector: 'node[entityType = "InvestmentFund"][?isRoot]', style: { 'background-color': '#087078', 'border-color': '#fcb315' } },
          { selector: 'node[?hasReview]', style: { 'border-color': '#fcb315', 'border-style': 'double', 'border-width': 4 } },
          {
            selector: 'edge',
            style: {
              width: 1.6,
              'line-color': '#3f6f9f',
              'target-arrow-color': '#3f6f9f',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 0.7,
              'curve-style': 'unbundled-bezier',
              'control-point-distances': 24,
              'control-point-weights': 0.5,
              'line-cap': 'round',
              opacity: 0.72,
              label: '',
              'overlay-opacity': 0,
              'transition-property': 'opacity, line-color, width',
              'transition-duration': 170,
            },
          },
          { selector: 'edge[!isConfirmed]', style: { 'line-style': 'dashed', 'line-dash-pattern': [8, 6], 'line-color': '#c58b27', 'target-arrow-color': '#c58b27', opacity: 0.82 } },
          { selector: 'edge[?hasReview]', style: { width: 2.8, 'line-color': '#fcb315', 'target-arrow-color': '#fcb315' } },
          { selector: 'node.is-focused, node:selected', style: { 'border-color': '#ffffff', 'border-width': 4, 'z-index': 90 } },
          {
            selector: 'edge.is-focused, edge:selected',
            style: {
              width: 4,
              'line-color': '#9ed2ff',
              'target-arrow-color': '#9ed2ff',
              opacity: 1,
              label: 'data(label)',
              color: '#dce9f7',
              'font-size': 8,
              'text-background-color': '#0c2948',
              'text-background-opacity': 0.92,
              'text-background-padding': '4px',
            },
          },
          { selector: '.is-route', style: { opacity: 1, 'z-index': 100 } },
          { selector: '.is-neighborhood', style: { opacity: 1, 'z-index': 70 } },
          { selector: 'node.is-neighborhood', style: { 'border-width': 3, 'border-color': '#8ed7ff' } },
          { selector: 'edge.is-neighborhood', style: { width: 2.8, opacity: 0.96, 'line-color': '#5f9fd8', 'target-arrow-color': '#5f9fd8' } },
          { selector: 'node.is-route', style: { 'border-color': '#fcb315', 'border-width': 5 } },
          { selector: 'edge.is-route', style: { width: 5, 'line-color': '#fcb315', 'target-arrow-color': '#fcb315', 'line-style': 'solid' } },
          { selector: '.is-dimmed, .is-search-dimmed', style: { opacity: 0.13 } },
          { selector: 'node.is-search-match', style: { 'border-color': '#ffffff', 'border-width': 5 } },
        ],
      });

      cyRef.current = cy;
      applyVisibility(cy, entities, relationships, filtersRef.current);
      runLayout(cy, layoutRef.current, rootEntity.id, reduceMotion);

      cy.on('tap', 'node', (event) => {
        const id = event.target.id();
        const entity = entities.find((item) => item.id === id);
        clearRouteTimers();
        setRoute(null);
        setSelection({ kind: 'node', id });
        focusNeighborhood(cy, event.target, reduceMotion);
        const directCount = event.target.connectedEdges(':visible').length;
        setAnnouncement(entity ? `${entity.name} selecionado. ${directCount} conexão(ões) direta(s).` : 'Entidade selecionada.');
      });

      cy.on('tap', 'edge', (event) => {
        const id = event.target.id();
        const relationship = relationships.find((item) => item.id === id);
        clearRouteTimers();
        setRoute(null);
        setSelection({ kind: 'edge', id });
        cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood');
        event.target.addClass('is-focused');
        setAnnouncement(relationship ? `${relationship.label || relationship.type} selecionado.` : 'Relação selecionada.');
      });

      cy.on('tap', (event) => {
        if (event.target === cy) {
          clearRouteTimers();
          setSelection(null);
          setRoute(null);
          cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood');
          cy.animate({ fit: { eles: cy.elements(':visible'), padding: 80 }, duration: reduceMotion ? 0 : 360 });
        }
      });

      cy.on('mouseover', 'node', (event) => {
        if (routeTimersRef.current.length > 0 || cy.$('.is-focused, .is-route').length > 0) return;
        const neighborhood = event.target.closedNeighborhood();
        cy.elements(':visible').not(neighborhood).addClass('is-dimmed');
      });

      cy.on('mouseout', 'node', () => {
        if (routeTimersRef.current.length === 0 && cy.$('.is-focused, .is-route').length === 0) cy.elements().removeClass('is-dimmed');
      });

      setIsGraphReady(true);
    });

    return () => {
      disposed = true;
      clearRouteTimers();
      if (viewportRestoreTimerRef.current !== null) {
        window.clearTimeout(viewportRestoreTimerRef.current);
        viewportRestoreTimerRef.current = null;
      }
      cyRef.current?.destroy();
      cyRef.current = null;
      setIsGraphReady(false);
    };
  }, [egos, entities, findings, reduceMotion, relationships, rootEntity]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyVisibility(cy, entities, relationships, {
      depth,
      relation: relationFilter,
      showDocuments,
    });
    setSelection((current) => {
      if (!current) return current;
      const element = cy.getElementById(current.id);
      return element.empty() || element.hidden() ? null : current;
    });
    clearRouteTimers();
    setRoute(null);
    cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood');
    runLayout(cy, layoutMode, rootEntity?.id, reduceMotion);
  }, [depth, entities, layoutMode, reduceMotion, relationFilter, relationships, rootEntity?.id, showDocuments]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const term = normalizeText(searchTerm);
    cy.elements().removeClass('is-search-match is-search-dimmed');
    if (term.length < 2) return;
    const matches = cy.nodes(':visible').filter((node) => normalizeText(String(node.data('label') || '')).includes(term));
    if (matches.length === 0) {
      setAnnouncement('Nenhuma entidade visível corresponde à busca.');
      return;
    }
    cy.nodes(':visible').not(matches).addClass('is-search-dimmed');
    matches.addClass('is-search-match');
    cy.animate({ fit: { eles: matches, padding: 110 }, duration: reduceMotion ? 0 : 360 });
    setAnnouncement(`${matches.length} entidade(s) encontrada(s).`);
  }, [reduceMotion, searchTerm]);

  const focusEntity = (entityId: string) => {
    const cy = cyRef.current;
    const entity = entities.find((item) => item.id === entityId);
    if (!cy || !entity) return;
    const node = cy.getElementById(entityId);
    if (node.empty()) return;
    if (node.hidden()) {
      setDepth('all');
      setRelationFilter('all');
      if (entity.type === 'Document') setShowDocuments(true);
      setSelection({ kind: 'node', id: entityId });
      setAnnouncement(`Revelando as conexões de ${entity.name}.`);
      window.setTimeout(() => {
        const current = cyRef.current?.getElementById(entityId);
        if (current && !current.empty() && current.visible()) focusNeighborhood(cyRef.current!, current, reduceMotion);
      }, reduceMotion ? 0 : 760);
      return;
    }
    setRoute(null);
    setSelection({ kind: 'node', id: entityId });
    focusNeighborhood(cy, node, reduceMotion);
    setAnnouncement(`${entity.name} selecionado. ${node.connectedEdges(':visible').length} conexão(ões) direta(s).`);
  };

  const traceRoute = (targetId: string) => {
    const cy = cyRef.current;
    if (!cy || !rootEntity || targetId === rootEntity.id) return;
    clearRouteTimers();
    const rootNode = cy.getElementById(rootEntity.id);
    const targetNode = cy.getElementById(targetId);
    if (rootNode.empty() || targetNode.empty() || targetNode.hidden()) return;

    const result = cy.elements(':visible').aStar({
      root: rootNode,
      goal: targetNode,
      directed: false,
      weight: (edge) => relationshipWeight(String(edge.data('status') || '')),
    });

    if (!result.found || !result.path) {
      setRoute(null);
      setAnnouncement('Nenhum caminho visível foi encontrado até essa entidade.');
      return;
    }

    const path = result.path;
    const pathEdges = path.edges();
    const nodeIds = path.nodes().map((node) => node.id());
    const edgeIds = pathEdges.map((edge) => edge.id());
    const confidences = pathEdges
      .map((edge) => confidencePercent(edge.data('confidence')))
      .filter((value): value is number => value !== null);
    const pathEvidence = evidences.filter((evidence) => (
      evidence.relationshipId ? edgeIds.includes(evidence.relationshipId) : false
    ));
    const target = entities.find((entity) => entity.id === targetId);
    const items: RouteItem[] = path.map((element) => ({
      id: element.id(),
      kind: element.isNode() ? 'node' : 'edge',
      label: element.isNode()
        ? String(element.data('label') || 'Entidade')
        : String(element.data('label') || 'Relação'),
    }));

    const summary: RouteSummary = {
      targetId,
      targetName: target?.name || 'Entidade selecionada',
      hops: pathEdges.length,
      confidence: confidences.length > 0 ? Math.min(...confidences) : null,
      confirmed: pathEdges.length > 0 && pathEdges.every((edge) => isConfirmed(String(edge.data('status') || ''))),
      evidenceCount: new Set(pathEvidence.map((evidence) => evidence.id)).size,
      nodeIds,
      edgeIds,
      items,
    };

    setRoute(summary);
    cy.elements().removeClass('is-route is-dimmed is-focused is-neighborhood');
    cy.elements(':visible').not(path).addClass('is-dimmed');

    if (reduceMotion) {
      path.addClass('is-route');
    } else {
      path.forEach((element, index) => {
        const timer = window.setTimeout(() => element.addClass('is-route'), index * 75);
        routeTimersRef.current.push(timer);
      });
    }

    cy.animate({ fit: { eles: path, padding: 100 }, duration: reduceMotion ? 0 : 720 });
    setAnnouncement(`Caminho até ${summary.targetName}: ${summary.hops} elo(s).`);
  };

  const toggleFullscreen = async () => {
    if (!wrapperRef.current) return;
    try {
      if (document.fullscreenElement === wrapperRef.current) await document.exitFullscreen();
      else await wrapperRef.current.requestFullscreen();
    } catch {
      setAnnouncement('O navegador não permitiu abrir a rede em tela cheia.');
    }
  };

  const fitGraph = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ fit: { eles: cy.elements(':visible'), padding: 80 }, duration: reduceMotion ? 0 : 360 });
  };

  if (!egos || entities.length === 0) {
    return (
      <section className="network-empty-state" aria-labelledby="network-empty-title">
        <div className="network-empty-orbit" aria-hidden="true"><Icons.Network size={34} /></div>
        <span>Rede investigativa</span>
        <h2 id="network-empty-title">A rede ainda não foi gerada</h2>
        <p>Atualize ou execute novamente esta diligência para produzir o snapshot EGOS. Nenhuma relação será simulada para preencher este espaço.</p>
      </section>
    );
  }

  const panelOpen = Boolean(route || selectedEntity || selectedRelationship);
  const relationshipSource = selectedRelationship
    ? entities.find((entity) => entity.id === selectedRelationship.sourceEntityId)
    : undefined;
  const relationshipTarget = selectedRelationship
    ? entities.find((entity) => entity.id === selectedRelationship.targetEntityId)
    : undefined;

  return (
    <section
      ref={wrapperRef}
      className={`network-investigation ${isFullscreen ? 'is-fullscreen' : ''}`}
      aria-labelledby="network-title"
    >
      <div className="network-live-region" aria-live="polite">{announcement}</div>

      <header className="network-investigation-header">
        <div className="network-brand-lockup" aria-label="Compliance SUAPE">
          <img
            src="/assets/Marca_Compliance_Suape_Compliance_Suape - H03.png"
            alt="Compliance SUAPE"
            width={842}
            height={596}
            draggable={false}
          />
        </div>
        <div className="network-title-block">
          <span>Campo investigativo</span>
          <h2 id="network-title">Quem se liga a quem</h2>
          <p>{rootEntity?.name || targetCompanyName}</p>
        </div>
        <div className="network-facts" aria-label="Resumo da rede">
          <span><strong>{entities.length}</strong> entidades</span>
          <span><strong>{relationships.length}</strong> relações</span>
          <span className={reviewCount > 0 ? 'has-review' : ''}><strong>{reviewCount}</strong> em revisão</span>
          <small>{formatGeneratedAt(egos.generatedAt)}</small>
        </div>
      </header>

      <div className="network-toolbar">
        <div className="network-search-control">
          <Icons.Search size={16} aria-hidden="true" />
          <label className="network-sr-only" htmlFor="network-search">Buscar pessoa ou empresa</label>
          <input
            id="network-search"
            name="network-search"
            type="search"
            autoComplete="off"
            placeholder="Buscar pessoa, empresa ou órgão"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="network-layout-switch" aria-label="Organização da rede">
          <button type="button" className={layoutMode === 'radar' ? 'active' : ''} aria-pressed={layoutMode === 'radar'} onClick={() => setLayoutMode('radar')}>
            <Icons.Compass size={15} aria-hidden="true" /> Radar
          </button>
          <button type="button" className={layoutMode === 'chain' ? 'active' : ''} aria-pressed={layoutMode === 'chain'} onClick={() => setLayoutMode('chain')}>
            <Icons.Layers size={15} aria-hidden="true" /> Cadeia
          </button>
        </div>

        <label className="network-select-control">
          <span>Profundidade</span>
          <select value={depth} onChange={(event) => setDepth(event.target.value as DepthFilter)}>
            <option value="1">Primeiro grau</option>
            <option value="2">Até segundo grau</option>
            <option value="all">Toda a rede</option>
          </select>
        </label>

        <label className="network-select-control">
          <span>Relação</span>
          <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}>
            <option value="all">Todas</option>
            {relationTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>

        <button type="button" className={`network-tool-button ${showDocuments ? 'active' : ''}`} aria-pressed={showDocuments} onClick={() => setShowDocuments((current) => !current)}>
          {showDocuments ? <Icons.Eye size={15} aria-hidden="true" /> : <Icons.EyeOff size={15} aria-hidden="true" />}
          Documentos
        </button>

        <div className="network-icon-actions">
          <button type="button" onClick={fitGraph} aria-label="Centralizar toda a rede" title="Centralizar rede">
            <Icons.Crosshair size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Abrir em tela cheia'} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {isFullscreen ? <Icons.Minimize size={17} aria-hidden="true" /> : <Icons.Maximize size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className={`network-canvas-grid ${panelOpen ? 'panel-open' : ''}`}>
        <div className="network-canvas-wrap">
          {!isGraphReady ? (
            <div className="network-loading" role="status">
              <Icons.Loader size={22} aria-hidden="true" /> Organizando relações comprováveis…
            </div>
          ) : null}
          <div ref={graphRef} className="network-canvas" role="img" aria-label={`Rede investigativa de ${rootEntity?.name || targetCompanyName}. Use a lista de entidades para navegação por teclado.`} />

          <div className="network-legend" aria-label="Legenda da rede">
            <span><i className="legend-root" /> Entidade analisada</span>
            <span><i className="legend-person" /> Pessoa</span>
            <span><i className="legend-institution" /> Instituição</span>
            <span><b className="legend-confirmed" /> Confirmada</span>
            <span><b className="legend-hypothesis" /> Hipótese</span>
          </div>

          <details className="network-entity-directory">
            <summary><Icons.Users size={15} aria-hidden="true" /> Entidades visíveis <span>{visibleEntities.length}</span></summary>
            <div className="network-entity-list">
              {visibleEntities.map((entity) => (
                <button type="button" key={entity.id} onClick={() => focusEntity(entity.id)}>
                  <span>{entity.name}</span>
                  <small>{TYPE_LABELS[entity.type] || entity.type}</small>
                </button>
              ))}
            </div>
          </details>
        </div>

        {panelOpen ? (
          <aside ref={inspectorRef} className="network-inspector" aria-live="polite" aria-label="Detalhes da seleção">
            <button type="button" className="network-inspector-close" onClick={closeInspector} aria-label="Fechar detalhes">
              <Icons.Close size={17} aria-hidden="true" />
            </button>

            {route ? (
              <div className="network-inspector-content">
                <span className="network-panel-kicker">Caminho comprovável</span>
                <h3>{rootEntity?.name} <Icons.ArrowRight size={15} aria-hidden="true" /> {route.targetName}</h3>
                <p>O caminho abaixo foi calculado apenas com as relações visíveis no snapshot EGOS.</p>

                <div className="network-route-metrics">
                  <span><strong>{route.hops}</strong> elos</span>
                  <span><strong>{route.confidence === null ? '—' : `${route.confidence}%`}</strong> menor confiança</span>
                  <span><strong>{route.evidenceCount}</strong> evidências</span>
                </div>

                <div className={`network-route-status ${route.confirmed ? 'confirmed' : 'review'}`}>
                  {route.confirmed ? <Icons.CheckCircle size={17} aria-hidden="true" /> : <Icons.AlertTriangle size={17} aria-hidden="true" />}
                  <div>
                    <strong>{route.confirmed ? 'Todos os elos estão confirmados' : 'O caminho contém hipótese'}</strong>
                    <span>{route.confirmed ? 'As relações do percurso têm status confirmado.' : 'Revise os elos tracejados antes de concluir.'}</span>
                  </div>
                </div>

                <ol className="network-route-timeline">
                  {route.items.map((item, index) => (
                    <li className={item.kind} key={`${item.id}-${index}`}>
                      <span>{item.kind === 'node' ? <Icons.User size={13} aria-hidden="true" /> : <Icons.Network size={13} aria-hidden="true" />}</span>
                      <div><small>{item.kind === 'node' ? 'Entidade' : 'Relação'}</small><strong>{item.label}</strong></div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {!route && selectedEntity ? (
              <div className="network-inspector-content">
                <span className="network-panel-kicker">Entidade selecionada</span>
                <h3>{selectedEntity.name}</h3>
                <div className="network-selection-meta">
                  <span>{TYPE_LABELS[selectedEntity.type] || selectedEntity.type}</span>
                  <span>Grau {selectedEntity.depth}</span>
                  <span>{confidencePercent(selectedEntity.confidence) === null ? 'Confiança não informada' : `${confidencePercent(selectedEntity.confidence)}% de confiança`}</span>
                </div>

                {selectedEntity.id !== rootEntity?.id ? (
                  <button type="button" className="network-trace-button" onClick={() => traceRoute(selectedEntity.id)}>
                    <Icons.Network size={16} aria-hidden="true" /> Traçar caminho até aqui <Icons.ArrowRight size={15} aria-hidden="true" />
                  </button>
                ) : null}

                <NetworkConnectionsCard
                  connections={selectedConnections}
                  onExplore={focusEntity}
                />

                {primitiveProperties(selectedEntity.properties).length > 0 ? (
                  <dl className="network-property-list">
                    {primitiveProperties(selectedEntity.properties).map(([key, value]) => (
                      <div key={key}><dt>{humanizeProperty(key)}</dt><dd>{displayProperty(value, key)}</dd></div>
                    ))}
                  </dl>
                ) : null}

                {selectedEntity.type === 'Person' ? (
                  <div className="network-person-context">
                    {selectedPepMatches.map((context) => (
                      <NetworkPepMatchCard
                        context={context}
                        entities={entities}
                        relationships={relationships}
                        key={`pep-${context.resolution.id}`}
                      />
                    ))}
                    <NetworkPersonOccurrencesCard
                      contexts={selectedPersonOccurrences}
                      searchCovered={personSearchCovered}
                    />
                    {selectedSuapeLinks.map((context) => (
                      <NetworkSuapeCard context={context} key={`suape-${context.internalPerson.id}`} />
                    ))}
                    <NetworkKinshipCard contexts={selectedKinships} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!route && selectedRelationship ? (
              <div className="network-inspector-content">
                <span className="network-panel-kicker">Relação selecionada</span>
                <h3>{selectedRelationship.label || selectedRelationship.type}</h3>
                <div className="network-relationship-pair">
                  <strong>{relationshipSource?.name || selectedRelationship.sourceName || 'Origem não informada'}</strong>
                  <Icons.ArrowRight size={15} aria-hidden="true" />
                  <strong>{relationshipTarget?.name || selectedRelationship.targetName || 'Destino não informado'}</strong>
                </div>
                <div className="network-selection-meta">
                  <span>{isConfirmed(selectedRelationship.status) ? 'Confirmada' : 'Hipótese / revisão'}</span>
                  <span>{confidencePercent(selectedRelationship.confidence) === null ? 'Confiança não informada' : `${confidencePercent(selectedRelationship.confidence)}% de confiança`}</span>
                </div>

                {primitiveProperties(selectedRelationship.properties).length > 0 ? (
                  <dl className="network-property-list">
                    {primitiveProperties(selectedRelationship.properties).map(([key, value]) => (
                      <div key={key}><dt>{humanizeProperty(key)}</dt><dd>{displayProperty(value, key)}</dd></div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}

            {!route && selection && selectedFindings.length > 0 ? (
              <section className="network-evidence-block">
                <h4>Achados relacionados <span>{selectedFindings.length}</span></h4>
                {selectedFindings.slice(0, 4).map((finding) => (
                  <article key={finding.id}><strong>{finding.title}</strong><p>{finding.explanation}</p></article>
                ))}
              </section>
            ) : null}

            {!route && selection ? (
              <section className="network-evidence-block">
                <h4>Evidências da seleção <span>{selectedEvidence.length}</span></h4>
                {selectedEvidence.length > 0 ? selectedEvidence.slice(0, 6).map((evidence) => {
                  const sourceUrl = safeExternalUrl(evidence.sourceUrl);
                  return (
                    <article key={evidence.id}>
                      <strong>{evidence.sourceName || evidence.provider}</strong>
                      {evidence.excerpt ? <p>{evidence.excerpt}</p> : null}
                      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Abrir fonte <Icons.ExternalLink size={12} aria-hidden="true" /></a> : null}
                    </article>
                  );
                }) : <p className="network-no-evidence">Nenhuma evidência individual foi vinculada diretamente a esta seleção.</p>}
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>

      <footer className="network-investigation-footer">
        <span><Icons.Info size={14} aria-hidden="true" /> Linhas sólidas representam relações confirmadas; tracejadas representam hipóteses que exigem revisão.</span>
        <span>{visibleEntities.length} de {entities.length} entidades visíveis</span>
      </footer>
    </section>
  );
};
