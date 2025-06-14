import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Route_definition } from "./route_definition.entity";

@Entity('route_handler_definition')
export class Route_handler_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "text", nullable: true })
    logic: string;
    @Column({ type: "varchar", nullable: true })
    method: string;
    @Index()
    @ManyToOne(() => Route_definition, (rel) => rel.handlers, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
